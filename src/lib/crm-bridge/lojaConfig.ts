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
      migrationPendente: error.message.includes('does not exist'),
    };
  }

  if (!data) {
    return { config: defaults, migrationPendente: false };
  }

  return {
    config: {
      ...defaults,
      ...(data as Partial<CrmLojaConfig>),
      loja_id: lojaId,
    },
    migrationPendente: false,
  };
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
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('crm_loja_configs')
    .upsert(payload, { onConflict: 'loja_id' })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Erro ao salvar crm_loja_configs (aplique a migration 20261120_phonecenter_crm_loja_configs.sql): ${error?.message || 'sem retorno'}`
    );
  }

  // Invalida cache de espelhamento imediatamente
  mirrorCache.clear();
  return data as CrmLojaConfig;
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
