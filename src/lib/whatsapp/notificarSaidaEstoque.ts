import type { SupabaseClient } from '@supabase/supabase-js';
import { estaNoEstoque, type EstadoCicloAparelho } from '@/lib/estoque/ciclo';
import { bateriaParaLista, getEmojiItem } from '@/lib/estoque/listaWhatsapp';
import { getAparelhoCodigo } from '@/lib/utils';
import { buscarGrupoWhatsAppPorNome, enviarTextoWhatsApp } from '@/lib/whatsappService';

export interface AparelhoNotificacaoSaida extends EstadoCicloAparelho {
  id?: string;
  loja_id?: string | null;
  marca?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  codigo?: string | null;
  saude_bateria?: string | number | null;
  saudeBateria?: string | number | null;
  bateria?: string | number | null;
  observacoes?: string | null;
  data_saida?: string | null;
}

const REGEX_EMOJIS = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retorna a data atual no fuso horário de Brasília (YYYY-MM-DD).
 */
export function obterDataHojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

function inicioDoDiaBrasiliaIso(dataHojeBr: string): string {
  return new Date(`${dataHojeBr}T00:00:00-03:00`).toISOString();
}

function dataPertenceAoDiaBr(valorData: unknown, dataHojeBr: string): boolean {
  if (!valorData) return false;
  const texto = String(valorData).trim();
  if (!texto) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto === dataHojeBr;
  }
  const dt = new Date(texto);
  if (Number.isNaN(dt.getTime())) return false;
  return obterDataHojeBrasilia(dt) === dataHojeBr;
}

function extrairImeiOuCodigo(aparelho: AparelhoNotificacaoSaida): string {
  const imeiColuna = String(aparelho.imei || '').trim();
  if (imeiColuna) return imeiColuna;

  if (aparelho.observacoes) {
    const match = String(aparelho.observacoes).match(/IMEI:\s*([A-Za-z0-9]+)/i);
    if (match?.[1]) return match[1].trim();
  }

  return getAparelhoCodigo(aparelho) || '';
}

function normalizarCapacidade(capacidade: unknown, modeloLimpo: string): string {
  const raw = String(capacidade || '').trim();
  if (!raw || /^n\/a$/i.test(raw) || /^null$/i.test(raw)) return '';
  let cap = raw.toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(cap)) cap = `${cap}GB`;
  else if (/^\d+G$/.test(cap)) cap = `${cap}B`;
  else if (/^\d+T$/.test(cap)) cap = `${cap}B`;

  if (modeloLimpo.toUpperCase().replace(/\s+/g, '').includes(cap)) {
    return '';
  }
  return cap;
}

/**
 * Formata a linha curta de aviso no grupo ESTOQUE:
 * `EMOJI MODELO GB COR % - IMEI [VENDIDO "Nome Cliente"]`
 */
export function formatarLinhaSaidaEstoqueVenda(
  aparelho: AparelhoNotificacaoSaida,
  clienteNome?: string | null
): string {
  const emoji = getEmojiItem(aparelho);
  const modeloLimpo = String(aparelho.modelo || 'Aparelho')
    .replace(/^Apple\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  const capLimpa = normalizarCapacidade(aparelho.capacidade, modeloLimpo);

  let corLimpa = String(aparelho.cor || '')
    .replace(REGEX_EMOJIS, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^(?:padr[aã]o|n\/a|null)$/i.test(corLimpa)) {
    corLimpa = '';
  }

  let bateriaStr = bateriaParaLista(aparelho);
  if (!bateriaStr && aparelho.bateria !== undefined && aparelho.bateria !== null) {
    const num = Number(String(aparelho.bateria).replace(/\D/g, ''));
    if (Number.isFinite(num) && num > 0 && num <= 100) {
      bateriaStr = `${num}%`;
    }
  }

  const ident = extrairImeiOuCodigo(aparelho);
  const nomeClienteLimpo = String(clienteNome || '')
    .replace(/"/g, "'")
    .replace(/\s+/g, ' ')
    .trim() || 'Cliente';

  const descricao = [modeloLimpo, capLimpa, corLimpa, bateriaStr].filter(Boolean).join(' ');
  const sufixoIdent = ident ? ` - ${ident}` : '';

  return `${emoji} ${descricao}${sufixoIdent} [VENDIDO "${nomeClienteLimpo}"]`
    .replace(/\s+/g, ' ')
    .trim();
}

function chavesIdempotenciaSaida(
  lojaId: string | null | undefined,
  aparelho: AparelhoNotificacaoSaida,
  dataHojeBr: string
): string[] {
  const loja = lojaId || aparelho.loja_id || 'sem-loja';
  const chaves: string[] = [];
  if (aparelho.id) {
    chaves.push(`saida_estoque_dia:${loja}:${aparelho.id}:${dataHojeBr}`);
  }
  const imeiDigits = String(aparelho.imei || '').replace(/\D/g, '');
  if (imeiDigits.length >= 14) {
    chaves.push(`saida_estoque_imei_dia:${loja}:${imeiDigits}:${dataHojeBr}`);
  }
  return chaves;
}

/**
 * Verifica se a saída do aparelho já foi registrada ou notificada no dia,
 * ou se o aparelho já não permanece mais no estoque.
 */
export async function foiSaidaRegistradaHoje(
  aparelho: AparelhoNotificacaoSaida,
  dataHojeBr: string = obterDataHojeBrasilia(),
  supabase?: SupabaseClient | null,
  lojaId?: string | null,
  loteIdIgnorar?: string | null
): Promise<boolean> {
  // Se o aparelho já não está mais no estoque antes desta operação, já estava em saída.
  if (!estaNoEstoque(aparelho)) return true;

  // Se já tem data_saida marcada no mesmo dia.
  if (dataPertenceAoDiaBr(aparelho.data_saida, dataHojeBr)) return true;

  if (!supabase || typeof (supabase as any).from !== 'function') return false;

  const chaves = chavesIdempotenciaSaida(lojaId, aparelho, dataHojeBr);
  if (chaves.length > 0) {
    try {
      const { data: cacheRows } = await supabase
        .from('whatsapp_antiflood_cache')
        .select('chave')
        .in('chave', chaves)
        .limit(1);

      if (Array.isArray(cacheRows) && cacheRows.length > 0) {
        return true;
      }
    } catch (err) {
      console.warn('[Saída Estoque] Aviso ao consultar cache diário:', err);
    }
  }

  if (aparelho.id && UUID_REGEX.test(aparelho.id)) {
    try {
      const { data: movs } = await supabase
        .from('movimentacoes_estoque')
        .select('id, tipo, lote_id, created_at')
        .eq('aparelho_id', aparelho.id)
        .in('tipo', ['saida', 'venda', 'baixa'])
        .gte('created_at', inicioDoDiaBrasiliaIso(dataHojeBr))
        .limit(10);

      if (Array.isArray(movs) && movs.length > 0) {
        const outrasMovsHoje = movs.filter((m: any) => {
          if (loteIdIgnorar && m?.lote_id === loteIdIgnorar) return false;
          if (m?.created_at && !dataPertenceAoDiaBr(m.created_at, dataHojeBr)) return false;
          return true;
        });
        if (outrasMovsHoje.length > 0) {
          return true;
        }
      }
    } catch (err) {
      console.warn('[Saída Estoque] Aviso ao consultar movimentações do dia:', err);
    }
  }

  return false;
}

/**
 * Resolve o JID (`...@g.us`) do grupo ESTOQUE da loja, usando a Evolution API
 * com fallback para o grupo configurado via `!modo estoque`.
 */
export async function resolverGrupoEstoqueJid(
  supabase: SupabaseClient | null | undefined,
  lojaId?: string | null
): Promise<string | null> {
  const jidPorNome = await buscarGrupoWhatsAppPorNome(lojaId || null, 'ESTOQUE');
  if (jidPorNome) return jidPorNome;

  if (supabase && typeof (supabase as any).from === 'function') {
    try {
      const { data } = await supabase
        .from('whatsapp_antiflood_cache')
        .select('chave, timestamp')
        .ilike('chave', 'chat_mode:%@g.us:estoque')
        .order('timestamp', { ascending: false })
        .limit(1);

      const chave = String((data as any)?.[0]?.chave || '');
      const match = chave.match(/^chat_mode:([^:]+@g\.us):estoque$/i);
      if (match?.[1]) return match[1];
    } catch (err) {
      console.warn('[Saída Estoque] Aviso no fallback chat_mode estoque:', err);
    }
  }

  return null;
}

export interface ParamsNotificarSaidaVenda {
  supabase: SupabaseClient | null | undefined;
  lojaId?: string | null;
  clienteNome?: string | null;
  aparelhos: AparelhoNotificacaoSaida[];
  loteId?: string | null;
  dataHojeBr?: string;
}

/**
 * Para cada aparelho que ainda permanecia no estoque e cuja saída ainda não foi
 * registrada no dia, envia uma mensagem curta no grupo ESTOQUE e grava a trava diária.
 */
export async function notificarSaidaVendaGrupoEstoque(
  params: ParamsNotificarSaidaVenda
): Promise<{ enviado: boolean; mensagens: string[] }> {
  const { supabase, lojaId, clienteNome, aparelhos, loteId } = params;
  if (!Array.isArray(aparelhos) || aparelhos.length === 0) {
    return { enviado: false, mensagens: [] };
  }

  const dataHojeBr = params.dataHojeBr || obterDataHojeBrasilia();
  const aparelhosParaNotificar: AparelhoNotificacaoSaida[] = [];
  const chavesVistasNoLote = new Set<string>();

  for (const ap of aparelhos) {
    if (!ap) continue;
    const chavesAp = chavesIdempotenciaSaida(lojaId, ap, dataHojeBr);
    if (chavesAp.some((c) => chavesVistasNoLote.has(c))) continue;

    const jaRegistrada = await foiSaidaRegistradaHoje(
      ap,
      dataHojeBr,
      supabase,
      lojaId,
      loteId
    );
    if (jaRegistrada) continue;

    chavesAp.forEach((c) => chavesVistasNoLote.add(c));
    aparelhosParaNotificar.push(ap);
  }

  if (aparelhosParaNotificar.length === 0) {
    return { enviado: false, mensagens: [] };
  }

  const grupoEstoqueJid = await resolverGrupoEstoqueJid(supabase, lojaId);
  if (!grupoEstoqueJid) {
    console.warn(`[Saída Estoque] Grupo ESTOQUE não localizado para a loja ${lojaId || 'padrão'}.`);
    return { enviado: false, mensagens: [] };
  }

  const linhas = aparelhosParaNotificar.map((ap) =>
    formatarLinhaSaidaEstoqueVenda(ap, clienteNome)
  );
  const textoMensagem = linhas.join('\n');

  const agora = Date.now();
  const todasChaves = aparelhosParaNotificar.flatMap((ap) =>
    chavesIdempotenciaSaida(lojaId, ap, dataHojeBr)
  );

  // Grava a trava diária antes do envio HTTP para evitar race condition em webhooks paralelos
  if (supabase && typeof (supabase as any).from === 'function' && todasChaves.length > 0) {
    try {
      await supabase.from('whatsapp_antiflood_cache').upsert(
        todasChaves.map((chave) => ({
          chave,
          timestamp: agora,
          created_at: new Date(agora).toISOString(),
        })),
        { onConflict: 'chave' }
      );
    } catch (err) {
      console.warn('[Saída Estoque] Aviso ao gravar trava diária:', err);
    }
  }

  const envio = await enviarTextoWhatsApp({
    lojaId: lojaId || null,
    telefone: grupoEstoqueJid,
    texto: textoMensagem,
  });

  if (!envio.success) {
    console.warn('[Saída Estoque] Falha ao enviar mensagem para grupo ESTOQUE:', envio.error);
    if (supabase && typeof (supabase as any).from === 'function' && todasChaves.length > 0) {
      try {
        await supabase.from('whatsapp_antiflood_cache').delete().in('chave', todasChaves);
      } catch {
        // silencioso
      }
    }
    return { enviado: false, mensagens: [] };
  }

  return { enviado: true, mensagens: linhas };
}
