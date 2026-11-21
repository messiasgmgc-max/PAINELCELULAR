import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { PAPEIS_GESTAO, type UsuarioServidor } from '@/lib/auth/acesso';
import { obterUsuarioServidor } from '@/lib/auth/servidor';
import { verificarPlanoCrmLoja } from './autoProvision';
import { buscarLojaPorBridgeToken, buscarLojaPorWebhookToken } from './lojaConfig';

const ALLOWED_ORIGIN_EXACT = new Set([
  'https://app.phonecenter.tech',
  'https://crm.phonecenter.tech',
  'https://api-crm.phonecenter.tech',
]);

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.crm\.phonecenter\.tech$/i,
  /^https:\/\/[a-z0-9-]+\.phonecenter\.tech$/i,
  /^http:\/\/localhost:\d+$/i,
  /^http:\/\/127\.0\.0\.1:\d+$/i,
];

export function origemPermitidaCrm(origin: string | null): boolean {
  if (!origin) return false;
  const limpo = origin.trim();
  if (ALLOWED_ORIGIN_EXACT.has(limpo)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(limpo));
}

export const CRM_BRIDGE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': 'https://crm.phonecenter.tech',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-PhoneCenter-CRM-Key, x-phonecenter-loja-id',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

export function obterCorsHeaders(req?: NextRequest): Record<string, string> {
  const origin = req?.headers.get('origin') || null;
  if (origin && origemPermitidaCrm(origin)) {
    return {
      ...CRM_BRIDGE_CORS_HEADERS,
      'Access-Control-Allow-Origin': origin,
    };
  }
  return CRM_BRIDGE_CORS_HEADERS;
}

export function crmBridgeOptionsResponse(req?: NextRequest): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: obterCorsHeaders(req),
  });
}

export function crmBridgeJson(data: unknown, status = 200, req?: NextRequest): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: obterCorsHeaders(req),
  });
}

/**
 * Comparação constante contra timing attacks.
 */
export function segredoIgual(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Resolve o segredo configurado para o PhoneCenter CRM Bridge.
 * Fail-closed em produção: se CRM_BRIDGE_SECRET não existir, aceita fallback
 * explícito apenas via EVOLUTION_API_KEY quando CRM_BRIDGE_ALLOW_EVO_KEY=true.
 */
export function obterSegredoBridge(): string {
  const secret = (process.env.CRM_BRIDGE_SECRET || '').trim();
  if (secret) return secret;
  if (process.env.CRM_BRIDGE_ALLOW_EVO_KEY === 'true') {
    return (process.env.EVOLUTION_API_KEY || '').trim();
  }
  return '';
}

export function extrairTokenRequest(req: NextRequest): string {
  const headerKey = req.headers.get('x-phonecenter-crm-key')?.trim();
  if (headerKey) return headerKey;

  const authHeader = req.headers.get('authorization')?.trim();
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const queryToken = req.nextUrl.searchParams.get('token')?.trim();
  if (queryToken) return queryToken;

  return '';
}

export interface AuthBridgeResult {
  ok: boolean;
  error?: string;
  status?: number;
}

export interface AuthBridgeContext extends AuthBridgeResult {
  nivel?: 'master' | 'sessao' | 'loja_token';
  lojaId?: string | null;
  superAdmin?: boolean;
  usuario?: UsuarioServidor | null;
}

export function autenticarBridge(req: NextRequest): AuthBridgeResult {
  const esperado = obterSegredoBridge();
  if (!esperado) {
    return {
      ok: false,
      status: 503,
      error: 'CRM_BRIDGE_SECRET não configurado no servidor PhoneCenter.',
    };
  }

  const recebido = extrairTokenRequest(req);
  if (!recebido || !segredoIgual(recebido, esperado)) {
    return {
      ok: false,
      status: 401,
      error: 'Não autorizado. Informe X-PhoneCenter-CRM-Key ou Bearer token válido.',
    };
  }

  return { ok: true };
}

/**
 * Autenticação segura multi-loja:
 * 1) Master secret (CRM_BRIDGE_SECRET) -> acesso administrativo global
 * 2) Token isolado por loja (bridge_token ou webhook_token em crm_loja_configs) -> travado na loja
 * 3) Sessão autenticada do PhoneCenter ERP (cookie sessao_usuario / Bearer JWT) -> travado na loja do usuário
 */
export async function autenticarBridgeAvancado(
  req: NextRequest,
  opts?: {
    requireMaster?: boolean;
    requireGestao?: boolean;
    allowWebhookToken?: boolean;
    skipPlanGate?: boolean;
  }
): Promise<AuthBridgeContext> {
  const esperadoMaster = obterSegredoBridge();
  const recebido = extrairTokenRequest(req);

  if (esperadoMaster && recebido && segredoIgual(recebido, esperadoMaster)) {
    return { ok: true, nivel: 'master', superAdmin: true };
  }

  // Tokens isolados por loja (não são JWTs de 3 segmentos)
  if (recebido && recebido.split('.').length !== 3) {
    let found = await buscarLojaPorBridgeToken(recebido);
    if (!found && opts?.allowWebhookToken) {
      found = await buscarLojaPorWebhookToken(recebido);
    }

    if (found) {
      if (opts?.requireMaster) {
        return {
          ok: false,
          status: 403,
          error: 'Ação restrita ao administrador da plataforma.',
        };
      }
      if (!opts?.skipPlanGate) {
        const plano = await verificarPlanoCrmLoja(found.lojaId);
        if (!plano.liberado) {
          return {
            ok: false,
            status: 403,
            error: plano.motivo || 'O PhoneCenterCRM é exclusivo do plano Avançado.',
          };
        }
      }
      return {
        ok: true,
        nivel: 'loja_token',
        lojaId: found.lojaId,
        superAdmin: false,
      };
    }
  }

  // Sessão do usuário logado no PhoneCenter ERP
  const usuario = await obterUsuarioServidor(req);
  if (usuario) {
    if (opts?.requireMaster && !usuario.superAdmin) {
      return {
        ok: false,
        status: 403,
        error: 'Acesso restrito ao administrador da plataforma.',
      };
    }
    if (opts?.requireGestao && !usuario.superAdmin && !PAPEIS_GESTAO.includes(usuario.role)) {
      return {
        ok: false,
        status: 403,
        error: 'Ação restrita a administradores e gerentes da loja.',
      };
    }
    if (!usuario.superAdmin && !usuario.lojaId) {
      return {
        ok: false,
        status: 403,
        error: 'Seu usuário não está vinculado a nenhuma loja.',
      };
    }
    if (!usuario.superAdmin && !opts?.skipPlanGate && usuario.lojaId) {
      const plano = await verificarPlanoCrmLoja(usuario.lojaId);
      if (!plano.liberado) {
        return {
          ok: false,
          status: 403,
          error: plano.motivo || 'O PhoneCenterCRM é exclusivo do plano Avançado.',
        };
      }
    }
    return {
      ok: true,
      nivel: 'sessao',
      lojaId: usuario.lojaId,
      superAdmin: usuario.superAdmin,
      usuario,
    };
  }

  return {
    ok: false,
    status: 401,
    error: 'Não autorizado. Faça login no PhoneCenter ERP ou informe o token isolado da loja.',
  };
}

export interface LojaResolvida {
  id: string;
  nome: string;
}

/**
 * Resolve qual loja do PhoneCenter ERP deve responder à chamada do CRM.
 * Aceita ?loja_id=<uuid> ou header x-phonecenter-loja-id, com fallback para
 * CRM_DEFAULT_LOJA_ID ou primeira loja ativa no Supabase.
 */
export async function resolverLojaBridge(
  req: NextRequest,
  lojaIdExplicito?: string | null
): Promise<LojaResolvida | null> {
  const candidato =
    lojaIdExplicito?.trim() ||
    req.nextUrl.searchParams.get('loja_id')?.trim() ||
    req.headers.get('x-phonecenter-loja-id')?.trim() ||
    (process.env.CRM_DEFAULT_LOJA_ID || '').trim();

  if (candidato) {
    const { data } = await supabaseAdmin
      .from('lojas')
      .select('id, nome')
      .eq('id', candidato)
      .maybeSingle();
    if (data?.id) {
      return { id: String(data.id), nome: String(data.nome || 'PhoneCenter') };
    }
  }

  const { data: lojaAtiva } = await supabaseAdmin
    .from('lojas')
    .select('id, nome')
    .eq('ativo', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lojaAtiva?.id) {
    return { id: String(lojaAtiva.id), nome: String(lojaAtiva.nome || 'PhoneCenter') };
  }

  return null;
}

/**
 * Garante isolamento estrito por loja: usuários de loja ou tokens de loja NUNCA
 * podem sobrescrever loja_id via query/header/body.
 */
export async function resolverLojaAutorizada(
  req: NextRequest,
  auth: AuthBridgeContext,
  lojaIdExplicito?: string | null
): Promise<LojaResolvida | null> {
  if (auth.nivel === 'loja_token' || (auth.nivel === 'sessao' && !auth.superAdmin)) {
    if (!auth.lojaId) return null;
    const { data } = await supabaseAdmin
      .from('lojas')
      .select('id, nome')
      .eq('id', auth.lojaId)
      .maybeSingle();
    if (!data?.id) return null;
    return { id: String(data.id), nome: String(data.nome || 'PhoneCenter') };
  }

  return resolverLojaBridge(req, lojaIdExplicito || auth.lojaId);
}
