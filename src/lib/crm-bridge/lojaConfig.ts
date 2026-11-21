import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';

export interface CrmLojaConfig {
  loja_id: string;
  crm_ativo: boolean;
  crm_frontend_url: string;
  crm_api_url: string;
  crm_access_token: string;
  evolution_instance_name: string;
  espelhar_webhook_crm: boolean;
  pix_key: string;
  pix_city: string;
  pix_provedor: 'estatico_emv' | 'mercadopago' | 'asaas';
  mercadopago_access_token: string;
  asaas_api_key: string;
  asaas_customer_id: string;
  meta_pixel_id: string;
  meta_capi_access_token: string;
  whatsapp_bio_numero: string;
  // Expansão Multi-Loja, Segurança, Pós-Venda, SLA & Telefonia (migration 20261121)
  bridge_token: string;
  webhook_token: string;
  modo_tenant: 'compartilhado' | 'isolado';
  evo_team_id: number | null;
  evo_inbox_id: number | null;
  google_review_url: string;
  pos_venda_ativo: boolean;
  telefonia_ativo: boolean;
  telefonia_provedor: 'click_to_call' | 'sip_webrtc' | 'webhook_pabx';
  telefonia_ramal_url: string;
  sla_alerta_minutos: number;
  sla_critico_minutos: number;
}

const COLUNAS_BASE_CRM_CONFIG: Array<keyof CrmLojaConfig> = [
  'loja_id',
  'crm_ativo',
  'crm_frontend_url',
  'crm_api_url',
  'crm_access_token',
  'evolution_instance_name',
  'espelhar_webhook_crm',
  'pix_key',
  'pix_city',
  'pix_provedor',
  'mercadopago_access_token',
  'asaas_api_key',
  'asaas_customer_id',
  'meta_pixel_id',
  'meta_capi_access_token',
  'whatsapp_bio_numero',
];

function tokensIguaisConstante(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function gerarTokenSeguroLoja(prefixo = 'pc_loja'): string {
  return `${prefixo}_${crypto.randomBytes(24).toString('base64url')}`;
}

export function criarConfigDefaultLoja(lojaId: string): CrmLojaConfig {
  return {
    loja_id: lojaId,
    crm_ativo: true,
    crm_frontend_url: 'https://crm.phonecenter.tech',
    crm_api_url: 'https://api-crm.phonecenter.tech',
    crm_access_token: '',
    evolution_instance_name: '',
    espelhar_webhook_crm: false,
    pix_key: '',
    pix_city: 'BRASIL',
    pix_provedor: 'estatico_emv',
    mercadopago_access_token: '',
    asaas_api_key: '',
    asaas_customer_id: '',
    meta_pixel_id: '',
    meta_capi_access_token: '',
    whatsapp_bio_numero: '',
    bridge_token: '',
    webhook_token: '',
    modo_tenant: 'compartilhado',
    evo_team_id: null,
    evo_inbox_id: null,
    google_review_url: '',
    pos_venda_ativo: false,
    telefonia_ativo: false,
    telefonia_provedor: 'click_to_call',
    telefonia_ramal_url: '',
    sla_alerta_minutos: 15,
    sla_critico_minutos: 120,
  };
}

function normalizarConfigRow(lojaId: string, data: Record<string, unknown>): CrmLojaConfig {
  const defaults = criarConfigDefaultLoja(lojaId);
  const modo = data.modo_tenant === 'isolado' ? 'isolado' : 'compartilhado';
  const telProv =
    data.telefonia_provedor === 'sip_webrtc' || data.telefonia_provedor === 'webhook_pabx'
      ? data.telefonia_provedor
      : 'click_to_call';

  return {
    ...defaults,
    ...(data as Partial<CrmLojaConfig>),
    loja_id: lojaId,
    modo_tenant: modo,
    telefonia_provedor: telProv,
    evo_team_id: data.evo_team_id != null ? Number(data.evo_team_id) : null,
    evo_inbox_id: data.evo_inbox_id != null ? Number(data.evo_inbox_id) : null,
    sla_alerta_minutos: Math.max(1, Number(data.sla_alerta_minutos ?? defaults.sla_alerta_minutos)),
    sla_critico_minutos: Math.max(5, Number(data.sla_critico_minutos ?? defaults.sla_critico_minutos)),
    bridge_token: String(data.bridge_token || ''),
    webhook_token: String(data.webhook_token || ''),
    google_review_url: String(data.google_review_url || ''),
    telefonia_ramal_url: String(data.telefonia_ramal_url || ''),
    pos_venda_ativo: Boolean(data.pos_venda_ativo),
    telefonia_ativo: Boolean(data.telefonia_ativo),
  };
}

/**
 * Busca configuração CRM isolada da loja no Supabase (crm_loja_configs).
 * Seguro mesmo se a migration ainda não tiver sido aplicada.
 */
export async function obterConfigCrmLoja(lojaId: string): Promise<{
  config: CrmLojaConfig;
  migrationPendente: boolean;
}> {
  const defaults = criarConfigDefaultLoja(lojaId);
  if (!lojaId) return { config: defaults, migrationPendente: false };

  const { data, error } = await supabaseAdmin
    .from('crm_loja_configs')
    .select('*')
    .eq('loja_id', lojaId)
    .maybeSingle();

  if (error) {
    return {
      config: defaults,
      migrationPendente:
        error.message.includes('does not exist') || error.message.includes('schema cache'),
    };
  }

  if (!data) {
    return { config: defaults, migrationPendente: false };
  }

  return {
    config: normalizarConfigRow(lojaId, data as Record<string, unknown>),
    migrationPendente: false,
  };
}

/**
 * Garante que a loja possua `bridge_token` e `webhook_token` isolados em `crm_loja_configs`.
 */
export async function garantirTokensLoja(lojaId: string): Promise<{
  bridgeToken: string;
  webhookToken: string;
  migrationPendente: boolean;
}> {
  if (!lojaId) return { bridgeToken: '', webhookToken: '', migrationPendente: false };

  const { config, migrationPendente } = await obterConfigCrmLoja(lojaId);
  if (migrationPendente) {
    return { bridgeToken: '', webhookToken: '', migrationPendente: true };
  }

  let bridgeToken = config.bridge_token.trim();
  let webhookToken = config.webhook_token.trim();
  if (bridgeToken && webhookToken) {
    return { bridgeToken, webhookToken, migrationPendente: false };
  }

  if (!bridgeToken) bridgeToken = gerarTokenSeguroLoja('pc_loja');
  if (!webhookToken) webhookToken = gerarTokenSeguroLoja('pc_wh');

  try {
    await salvarConfigCrmLoja(lojaId, {
      bridge_token: bridgeToken,
      webhook_token: webhookToken,
    });
    return { bridgeToken, webhookToken, migrationPendente: false };
  } catch {
    return { bridgeToken: config.bridge_token, webhookToken: config.webhook_token, migrationPendente: true };
  }
}

export async function buscarLojaPorBridgeToken(
  token: string
): Promise<{ lojaId: string; config: CrmLojaConfig } | null> {
  const limpo = String(token || '').trim();
  if (limpo.length < 16) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('crm_loja_configs')
      .select('*')
      .eq('bridge_token', limpo)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const salvo = String(row.bridge_token || '');
    if (!tokensIguaisConstante(limpo, salvo)) return null;
    const lojaId = String(row.loja_id || '');
    if (!lojaId) return null;
    return { lojaId, config: normalizarConfigRow(lojaId, row) };
  } catch {
    return null;
  }
}

export async function buscarLojaPorWebhookToken(
  token: string
): Promise<{ lojaId: string; config: CrmLojaConfig } | null> {
  const limpo = String(token || '').trim();
  if (limpo.length < 16) return null;

  try {
    const { data, error } = await supabaseAdmin
      .from('crm_loja_configs')
      .select('*')
      .eq('webhook_token', limpo)
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const salvo = String(row.webhook_token || '');
    if (!tokensIguaisConstante(limpo, salvo)) return null;
    const lojaId = String(row.loja_id || '');
    if (!lojaId) return null;
    return { lojaId, config: normalizarConfigRow(lojaId, row) };
  } catch {
    return null;
  }
}

export async function salvarConfigCrmLoja(
  lojaId: string,
  patch: Partial<Omit<CrmLojaConfig, 'loja_id'>>
): Promise<CrmLojaConfig> {
  const { config: atual } = await obterConfigCrmLoja(lojaId);

  const payload: CrmLojaConfig & { updated_at: string } = {
    ...atual,
    ...patch,
    loja_id: lojaId,
    crm_frontend_url: (patch.crm_frontend_url ?? atual.crm_frontend_url).trim().replace(/\/+$/, ''),
    crm_api_url: (patch.crm_api_url ?? atual.crm_api_url).trim().replace(/\/+$/, ''),
    evolution_instance_name: (patch.evolution_instance_name ?? atual.evolution_instance_name).trim(),
    pix_key: (patch.pix_key ?? atual.pix_key).trim(),
    pix_city: (patch.pix_city ?? atual.pix_city).trim() || 'BRASIL',
    google_review_url: (patch.google_review_url ?? atual.google_review_url).trim(),
    telefonia_ramal_url: (patch.telefonia_ramal_url ?? atual.telefonia_ramal_url).trim(),
    sla_alerta_minutos: Math.max(1, Number(patch.sla_alerta_minutos ?? atual.sla_alerta_minutos) || 15),
    sla_critico_minutos: Math.max(5, Number(patch.sla_critico_minutos ?? atual.sla_critico_minutos) || 120),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('crm_loja_configs')
    .upsert(payload, { onConflict: 'loja_id' })
    .select('*')
    .single();

  if (error) {
    // Fallback elegante se a migration 20261121 ainda não foi rodada no Supabase
    const msg = error.message || '';
    if (msg.includes('column') && (msg.includes('does not exist') || msg.includes('schema cache'))) {
      const payloadBase: Record<string, unknown> = { updated_at: payload.updated_at };
      for (const k of COLUNAS_BASE_CRM_CONFIG) {
        payloadBase[k] = payload[k];
      }
      const { data: dataBase, error: errBase } = await supabaseAdmin
        .from('crm_loja_configs')
        .upsert(payloadBase, { onConflict: 'loja_id' })
        .select('*')
        .single();

      if (!errBase && dataBase) {
        mirrorCache.clear();
        return normalizarConfigRow(lojaId, dataBase as Record<string, unknown>);
      }
    }

    throw new Error(
      `Erro ao salvar crm_loja_configs (aplique as migrations 20261120 e 20261121): ${error.message}`
    );
  }

  if (!data) {
    throw new Error('Erro ao salvar crm_loja_configs: sem retorno do Supabase.');
  }

  // Invalida cache de espelhamento imediatamente
  mirrorCache.clear();
  return normalizarConfigRow(lojaId, data as Record<string, unknown>);
}

// ── Cache leve em memória (60s) para espelhamento zero-latência no webhook Evolution ──
const mirrorCache = new Map<string, { url: string | null; expiraEm: number }>();

/**
 * Se a instância Evolution API estiver marcada com espelhar_webhook_crm=true
 * em crm_loja_configs, encaminha uma cópia assíncrona do payload para o EvoCRM
 * sem interferir em nada no bot de notinhas/estoque do PAINELCELULAR.
 */
export async function espelharWebhookEvolutionParaCrm(
  instanceName: string,
  rawBody: string
): Promise<void> {
  const inst = String(instanceName || '').trim();
  if (!inst || !rawBody) return;

  const agora = Date.now();
  let targetUrl: string | null = null;
  const cached = mirrorCache.get(inst);

  if (cached && cached.expiraEm > agora) {
    targetUrl = cached.url;
  } else {
    try {
      const { data } = await supabaseAdmin
        .from('crm_loja_configs')
        .select('crm_api_url, espelhar_webhook_crm, crm_ativo')
        .eq('evolution_instance_name', inst)
        .eq('espelhar_webhook_crm', true)
        .eq('crm_ativo', true)
        .limit(1)
        .maybeSingle();

      if (data?.crm_api_url) {
        targetUrl = `${String(data.crm_api_url).replace(/\/+$/, '')}/webhooks/whatsapp/evolution`;
      }
      mirrorCache.set(inst, { url: targetUrl, expiraEm: agora + 60_000 });
    } catch {
      mirrorCache.set(inst, { url: null, expiraEm: agora + 30_000 });
      return;
    }
  }

  if (!targetUrl) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PhoneCenter-Mirror': '1' },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Nunca propaga falha de espelhamento para o fluxo principal do bot
  }
}
