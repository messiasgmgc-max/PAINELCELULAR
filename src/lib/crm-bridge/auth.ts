import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const CRM_BRIDGE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PhoneCenter-CRM-Key',
  'Access-Control-Max-Age': '86400',
};

export function crmBridgeOptionsResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: CRM_BRIDGE_CORS_HEADERS,
  });
}

export function crmBridgeJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: CRM_BRIDGE_CORS_HEADERS,
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
