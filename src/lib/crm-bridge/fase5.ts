import crypto from 'crypto';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { formatarBRL, ParcelaSimulada, simularPropostaBridge } from './queries';
import { RespostaCondicaoUpgrade } from '@/lib/upgradeEngine';

export interface PropostaRecord {
  id: string;
  loja_id: string;
  protocolo: string;
  token_publico: string;
  cliente_nome: string;
  cliente_telefone: string;
  vendedor_nome: string;
  modelo_novo: string;
  valor_aparelho: number;
  troca_modelo: string;
  troca_capacidade: string;
  valor_troca: number;
  entrada_pix: number;
  saldo_financiar: number;
  parcelamento: ParcelaSimulada[];
  texto_whatsapp: string;
  status: 'enviada' | 'visualizada' | 'aceita' | 'recusada' | 'expirada';
  validade_ate: string;
  aceita_em: string | null;
  created_at: string;
}

export interface ReferralAnuncioExtraido {
  origem: string;
  ctwaClid: string;
  sourceId: string;
  campaignName: string;
  adHeadline: string;
  adBody: string;
  sourceUrl: string;
}

export function gerarProtocoloProposta(): string {
  const num = crypto.randomInt(1000, 9999);
  return `#PROP-${num}`;
}

export function gerarTokenPublicoProposta(): string {
  return crypto.randomBytes(12).toString('base64url');
}

export function montarUrlPublicaProposta(tokenPublico: string, origin?: string): string {
  const base = (
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://app.phonecenter.tech'
  ).replace(/\/+$/, '');
  return `${base}/proposta/${encodeURIComponent(tokenPublico)}`;
}

/**
 * Extrai dados de atribuição de anúncio (Meta Click-to-WhatsApp / Instagram Ads / UTM)
 * a partir de payloads do EvoCRM ou Evolution API.
 */
export function extrairReferralAnuncio(payload: Record<string, unknown>): ReferralAnuncioExtraido | null {
  const conv = (payload.conversation || {}) as Record<string, unknown>;
  const convAdd = (conv.additional_attributes || {}) as Record<string, unknown>;
  const payAdd = (payload.additional_attributes || {}) as Record<string, unknown>;
  const msg = (payload.message || payload.data || {}) as Record<string, unknown>;
  const ctxInfo = ((msg.contextInfo || payload.contextInfo || {}) as Record<string, unknown>);
  const extAd = (ctxInfo.externalAdReply || {}) as Record<string, unknown>;

  const ref = (payload.referral ||
    payAdd.referral ||
    convAdd.referral ||
    (Object.keys(extAd).length > 0 ? extAd : null)) as Record<string, unknown> | null;

  if (!ref || typeof ref !== 'object') {
    const utmSource = String(payAdd.utm_source || convAdd.utm_source || '').trim();
    const utmCampaign = String(payAdd.utm_campaign || convAdd.utm_campaign || '').trim();
    if (!utmSource && !utmCampaign) return null;
    return {
      origem: utmSource.toLowerCase().includes('insta')
        ? 'instagram_ad'
        : utmSource.toLowerCase().includes('google')
          ? 'google_ads'
          : utmSource || 'utm',
      ctwaClid: String(payAdd.ctwa_clid || convAdd.ctwa_clid || ''),
      sourceId: String(payAdd.ad_id || convAdd.ad_id || ''),
      campaignName: utmCampaign,
      adHeadline: String(payAdd.utm_content || convAdd.utm_content || ''),
      adBody: '',
      sourceUrl: String(payAdd.source_url || convAdd.source_url || ''),
    };
  }

  const sourceType = String(ref.source_type || ref.sourceType || '').toLowerCase();
  const sourceUrl = String(ref.source_url || ref.sourceUrl || '');
  const origem =
    sourceUrl.includes('instagram.com') || sourceType.includes('instagram')
      ? 'instagram_ad'
      : 'meta_ctwa';

  return {
    origem,
    ctwaClid: String(ref.ctwa_clid || ref.ctwaClid || ''),
    sourceId: String(ref.source_id || ref.sourceId || ref.ad_id || ''),
    campaignName: String(ref.campaign_name || ref.campaignName || ref.title || ''),
    adHeadline: String(ref.headline || ref.title || ''),
    adBody: String(ref.body || ''),
    sourceUrl,
  };
}

export async function criarPropostaBridge(
  lojaId: string,
  nomeLoja: string,
  input: {
    clienteNome?: string;
    clienteTelefone?: string;
    vendedorNome?: string;
    modeloNovo: string;
    valorAparelho: number;
    valorTrocaManual?: number;
    entradaPix?: number;
    validadeHoras?: number;
    origin?: string;
    troca?: {
      modelo: string;
      capacidade: string;
      condicoes?: Partial<RespostaCondicaoUpgrade>;
    };
  }
): Promise<{ proposta: PropostaRecord; urlPublica: string }> {
  const sim = await simularPropostaBridge(lojaId, {
    nomeLoja,
    modeloNovo: input.modeloNovo,
    valorAparelho: input.valorAparelho,
    valorTrocaManual: input.valorTrocaManual,
    entradaPix: input.entradaPix,
    troca: input.troca,
  });

  const protocolo = gerarProtocoloProposta();
  const tokenPublico = gerarTokenPublicoProposta();
  const urlPublica = montarUrlPublicaProposta(tokenPublico, input.origin);
  const horas = Math.min(Math.max(Number(input.validadeHoras) || 48, 1), 720);
  const validadeAte = new Date(Date.now() + horas * 3600 * 1000).toISOString();

  const textoComLink = [
    sim.textoWhatsapp,
    '',
    `🔗 *Ver proposta completa e confirmar:*`,
    urlPublica,
    `📄 Protocolo: *${protocolo}*`,
  ].join('\n');

  const row = {
    loja_id: lojaId,
    protocolo,
    token_publico: tokenPublico,
    cliente_nome: (input.clienteNome || 'Cliente').trim(),
    cliente_telefone: (input.clienteTelefone || '').trim(),
    vendedor_nome: (input.vendedorNome || 'Equipe Loja').trim(),
    modelo_novo: input.modeloNovo.trim(),
    valor_aparelho: sim.valorAparelho,
    troca_modelo: input.troca?.modelo || '',
    troca_capacidade: input.troca?.capacidade || '',
    valor_troca: sim.valorTroca,
    entrada_pix: sim.entradaPix,
    saldo_financiar: sim.saldoFinanciar,
    parcelamento: sim.parcelamento,
    texto_whatsapp: textoComLink,
    status: 'enviada' as const,
    validade_ate: validadeAte,
  };

  const { data, error } = await supabaseAdmin
    .from('crm_propostas')
    .insert(row)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(
      `Falha ao salvar proposta (aplique a migration 20261120_phonecenter_crm_modulos.sql): ${error?.message || 'sem retorno'}`
    );
  }

  return { proposta: data as PropostaRecord, urlPublica };
}

export async function listarPropostasBridge(lojaId: string, limit = 30): Promise<PropostaRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('crm_propostas')
    .select('*')
    .eq('loja_id', lojaId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error || !data) return [];
  return data as PropostaRecord[];
}

export async function registrarLeadAnuncioBridge(
  lojaId: string,
  ref: ReferralAnuncioExtraido,
  contato: { nome?: string; telefone?: string },
  metadata: Record<string, unknown> = {}
) {
  const { data, error } = await supabaseAdmin
    .from('crm_leads_anuncio')
    .insert({
      loja_id: lojaId,
      origem: ref.origem,
      ctwa_clid: ref.ctwaClid,
      source_id: ref.sourceId,
      campaign_name: ref.campaignName,
      ad_headline: ref.adHeadline,
      ad_body: ref.adBody,
      source_url: ref.sourceUrl,
      contato_nome: (contato.nome || '').trim(),
      contato_telefone: (contato.telefone || '').trim(),
      status: 'novo',
      metadata,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Erro ao registrar lead de anúncio: ${error.message}`);
  }
  return data;
}

export async function obterDashboardAnunciosBridge(lojaId: string, dias = 30) {
  const periodoDias = Math.min(Math.max(Number(dias) || 30, 1), 365);
  const desde = new Date(Date.now() - periodoDias * 86400 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('crm_leads_anuncio')
    .select('*')
    .eq('loja_id', lojaId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data) {
    return {
      periodoDias,
      totalLeads: 0,
      convertidos: 0,
      taxaConversao: 0,
      receitaAtribuida: 0,
      porAnuncio: [],
      leads: [],
      migrationPendente: Boolean(error?.message?.includes('does not exist')),
    };
  }

  const leads = data as Array<Record<string, unknown>>;
  let convertidos = 0;
  let receitaAtribuida = 0;
  const mapa = new Map<
    string,
    { chave: string; titulo: string; origem: string; leads: number; convertidos: number; receita: number }
  >();

  for (const l of leads) {
    const isConv = l.status === 'convertido';
    const val = Number(l.valor_venda) || 0;
    if (isConv) {
      convertidos += 1;
      receitaAtribuida += val;
    }
    const chave = String(l.source_id || l.campaign_name || l.ad_headline || 'Anúncio sem ID');
    const titulo = String(l.ad_headline || l.campaign_name || l.source_id || 'Campanha Meta/Ads');
    const origem = String(l.origem || 'meta_ctwa');
    const cur = mapa.get(chave) || { chave, titulo, origem, leads: 0, convertidos: 0, receita: 0 };
    cur.leads += 1;
    if (isConv) {
      cur.convertidos += 1;
      cur.receita += val;
    }
    mapa.set(chave, cur);
  }

  const porAnuncio = Array.from(mapa.values())
    .map((a) => ({
      ...a,
      receita: Math.round(a.receita * 100) / 100,
      taxaConversao: a.leads > 0 ? Math.round((a.convertidos / a.leads) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.receita - a.receita || b.leads - a.leads);

  return {
    periodoDias,
    totalLeads: leads.length,
    convertidos,
    taxaConversao: leads.length > 0 ? Math.round((convertidos / leads.length) * 1000) / 10 : 0,
    receitaAtribuida: Math.round(receitaAtribuida * 100) / 100,
    porAnuncio,
    leads: leads.slice(0, 40),
    migrationPendente: false,
  };
}

/**
 * Dispara evento Purchase server-side para a Meta Conversions API (CAPI)
 * quando META_PIXEL_ID e META_CAPI_ACCESS_TOKEN estiverem configurados.
 */
export async function dispararMetaCapiPurchase(input: {
  telefone?: string;
  ctwaClid?: string;
  valor: number;
  eventId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const pixelId = (process.env.META_PIXEL_ID || '').trim();
  const accessToken = (process.env.META_CAPI_ACCESS_TOKEN || '').trim();
  if (!pixelId || !accessToken) {
    return { sent: false, reason: 'META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN não configurados.' };
  }

  const telLimpo = String(input.telefone || '').replace(/\D/g, '');
  const phHash = telLimpo
    ? crypto.createHash('sha256').update(telLimpo).digest('hex')
    : undefined;

  const userData: Record<string, unknown> = {};
  if (phHash) userData.ph = [phHash];
  if (input.ctwaClid) userData.ctwa_clid = input.ctwaClid;

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: input.eventId,
            action_source: 'business_messaging',
            messaging_channel: 'whatsapp',
            user_data: userData,
            custom_data: {
              currency: 'BRL',
              value: Math.max(0, Number(input.valor) || 0),
            },
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return { sent: false, reason: `Meta CAPI HTTP ${res.status}: ${txt.slice(0, 200)}` };
  }
  return { sent: true };
}

export function formatarResumoPropostaCurto(p: Pick<PropostaRecord, 'protocolo' | 'modelo_novo' | 'saldo_financiar' | 'status'>): string {
  return `${p.protocolo} • ${p.modelo_novo} • ${formatarBRL(p.saldo_financiar)} (${p.status})`;
}
