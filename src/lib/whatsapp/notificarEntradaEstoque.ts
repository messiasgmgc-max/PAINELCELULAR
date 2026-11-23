import type { SupabaseClient } from '@supabase/supabase-js';
import { bateriaParaLista, getEmojiItem } from '@/lib/estoque/listaWhatsapp';
import { buscarGrupoWhatsAppPorNomes, enviarTextoWhatsApp } from '@/lib/whatsappService';
import { resolverGrupoEstoqueJid } from './notificarSaidaEstoque';

export interface ItemEntradaNotificacao {
  marca?: string | null;
  modelo: string;
  capacidade?: string | null;
  cor?: string | null;
  imei?: string | null;
  codigo?: string | null;
  bateria?: number | string | null;
  saude_bateria?: number | string | null;
  observacoes?: string | null;
  custo?: number | null;
  preco?: number | null;
  condicao?: string | null;
}

const NOMES_GRUPO_ENTRADAS = [
  'ENTRADAS',
  'ENTRADA',
  'ENTRADAS DE ESTOQUE',
  'ENTRADA DE ESTOQUE',
  'ENTRADAS ESTOQUE',
  'ENTRADA ESTOQUE',
];

function normalizarCapacidadeCurta(capacidade: unknown, modelo: string): string {
  const raw = String(capacidade || '').trim();
  if (!raw || /^(?:n\/a|null)$/i.test(raw)) return '';
  let cap = raw.toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(cap)) cap = `${cap}GB`;
  else if (/^\d+G$/.test(cap)) cap = `${cap}B`;
  else if (/^\d+T$/.test(cap)) cap = `${cap}B`;
  if (modelo.toUpperCase().replace(/\s+/g, '').includes(cap)) return '';
  return cap;
}

function limparObservacaoParaGrupo(obsRaw: unknown): string {
  const bruto = String(obsRaw || '').trim();
  if (!bruto) return '';
  // Remove metadados automáticos já exibidos nas colunas próprias
  const partes = bruto
    .split('|')
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (/^(?:ID|Bateria|IMEI)\s*:/i.test(p)) return false;
      if (/^(?:Entrada|Cadastrado)\s+(?:por\s+foto|em\s+lote|via)\s+WhatsApp/i.test(p)) return false;
      return true;
    })
    .map((p) => p.replace(/^Obs\s*:\s*/i, '').replace(/^\((.+)\)$/, '$1').trim())
    .filter(Boolean);

  return partes.join(' | ');
}

function formatarMoedaBr(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarDataBr(dataIso?: string | null): string {
  const bruto = String(dataIso || '').trim();
  if (!bruto) return '';
  const m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return bruto;
}

/**
 * Formata a mensagem enviada ao grupo de ENTRADAS quando o usuário registra
 * aparelhos a partir do WhatsApp pessoal (PV).
 */
export function formatarMensagemEntradaGrupo(params: {
  itens: ItemEntradaNotificacao[];
  usuarioNome?: string | null;
  dataEntrada?: string | null;
  origemLabel?: string | null;
}): string {
  const { itens, usuarioNome, dataEntrada, origemLabel } = params;
  const autor = String(usuarioNome || '').trim() || 'Equipe';
  const sufixoOrigem = origemLabel ? ` (${origemLabel})` : ' (PV)';
  const dataFmt = formatarDataBr(dataEntrada);

  const linhasItens = itens.map((item, idx) => {
    const emoji = getEmojiItem(item as any);
    const modeloLimpo = String(item.modelo || 'Aparelho')
      .replace(/^Apple\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const cap = normalizarCapacidadeCurta(item.capacidade, modeloLimpo);
    const corBruta = String(item.cor || '').trim();
    const cor = corBruta && !/^(?:padr[aã]o|n\/a|null)$/i.test(corBruta) ? corBruta : '';

    let bat = bateriaParaLista(item as any);
    if (!bat && item.bateria !== undefined && item.bateria !== null && String(item.bateria).trim() !== '') {
      const n = parseInt(String(item.bateria).replace(/\D/g, ''), 10);
      if (Number.isFinite(n) && n > 0 && n <= 100) bat = `${n}%`;
    }

    const imei = String(item.imei || '').trim();
    const codigo = String(item.codigo || '').trim();
    const custo = Number(item.custo || 0);
    const obs = limparObservacaoParaGrupo(item.observacoes);

    const desc = [modeloLimpo, cap, cor].filter(Boolean).join(' ');
    const extras: string[] = [];
    if (bat) extras.push(`🔋 ${bat}`);
    if (imei) extras.push(`IMEI: \`${imei}\``);
    if (codigo) extras.push(`Cód: #${codigo.replace(/^#/, '')}`);
    if (custo > 0) extras.push(`Custo: ${formatarMoedaBr(custo)}`);

    const prefixo = itens.length > 1 ? `${idx + 1}. ` : '';
    const linhaPrincipal = `${prefixo}${emoji} *${desc}*${extras.length > 0 ? ` | ${extras.join(' | ')}` : ''}`;
    return obs ? `${linhaPrincipal}\n   📝 *Obs:* ${obs}` : linhaPrincipal;
  });

  const cabecalho = [
    `📥 *ENTRADA REGISTRADA NO ESTOQUE*`,
    dataFmt ? `📅 *Data:* ${dataFmt}` : '',
    `👤 *Por:* ${autor}${sufixoOrigem}`,
  ]
    .filter(Boolean)
    .join('\n');

  const totalLinha =
    itens.length > 1 ? `\n📦 *Total:* ${itens.length} aparelhos\n\n` : '\n\n';

  return `${cabecalho}${totalLinha}${linhasItens.join('\n')}`;
}

/**
 * Resolve o JID (`...@g.us`) do grupo de ENTRADAS da loja.
 * Prioriza um grupo cujo nome seja/contenha "ENTRADAS" ou "ENTRADA";
 * se a loja não tiver um grupo dedicado de entradas, usa o grupo ESTOQUE como fallback.
 */
export async function resolverGrupoEntradasJid(
  supabase: SupabaseClient | null | undefined,
  lojaId?: string | null
): Promise<string | null> {
  const jidEntradas = await buscarGrupoWhatsAppPorNomes(lojaId || null, NOMES_GRUPO_ENTRADAS, {
    permitirMatchParcial: true,
  });
  if (jidEntradas) return jidEntradas;

  return resolverGrupoEstoqueJid(supabase, lojaId);
}

export interface ParamsNotificarEntradaGrupo {
  supabase: SupabaseClient | null | undefined;
  lojaId?: string | null;
  itens: ItemEntradaNotificacao[];
  usuarioNome?: string | null;
  dataEntrada?: string | null;
  origemIsGroup?: boolean;
  origemRemoteJid?: string | null;
  origemLabel?: string | null;
  resolverGrupoJid?: (
    supabase: SupabaseClient | null | undefined,
    lojaId?: string | null
  ) => Promise<string | null>;
  enviarTexto?: (params: {
    lojaId?: string | null;
    telefone: string;
    texto: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Espelha no grupo de ENTRADAS toda entrada de estoque feita no WhatsApp pessoal (PV).
 * Nunca duplica se a entrada já tiver sido feita em grupo ou no próprio grupo de entradas.
 */
export async function notificarEntradaGrupoEntradas(
  params: ParamsNotificarEntradaGrupo
): Promise<{ enviado: boolean; grupoJid?: string; mensagem?: string; motivo?: string }> {
  const {
    supabase,
    lojaId,
    itens,
    usuarioNome,
    dataEntrada,
    origemIsGroup,
    origemRemoteJid,
    origemLabel,
    resolverGrupoJid,
    enviarTexto,
  } = params;

  if (!Array.isArray(itens) || itens.length === 0) {
    return { enviado: false, motivo: 'sem_itens' };
  }

  // Só espelha quando a entrada partiu do pessoal (PV), evitando eco em grupos
  if (origemIsGroup) {
    return { enviado: false, motivo: 'origem_grupo' };
  }

  // Em execução de testes unitários sem mocks injetados, evita chamadas HTTP reais à Evolution API
  const emTesteSemMock =
    !resolverGrupoJid &&
    !enviarTexto &&
    Boolean(process.env.NODE_TEST_CONTEXT || process.env.VITEST);
  if (emTesteSemMock) {
    return { enviado: false, motivo: 'ambiente_teste' };
  }

  try {
    const resolvedor = resolverGrupoJid || resolverGrupoEntradasJid;
    const grupoJid = await resolvedor(supabase, lojaId);
    if (!grupoJid) {
      console.warn(`[Entrada Estoque] Grupo de ENTRADAS não localizado para a loja ${lojaId || 'padrão'}.`);
      return { enviado: false, motivo: 'grupo_nao_encontrado' };
    }

    if (origemRemoteJid && origemRemoteJid.trim() === grupoJid.trim()) {
      return { enviado: false, grupoJid, motivo: 'mesmo_chat' };
    }

    const mensagem = formatarMensagemEntradaGrupo({
      itens,
      usuarioNome,
      dataEntrada,
      origemLabel,
    });

    const disparar = enviarTexto || enviarTextoWhatsApp;
    const envio = await disparar({
      lojaId: lojaId || null,
      telefone: grupoJid,
      texto: mensagem,
    });

    if (!envio.success) {
      console.warn('[Entrada Estoque] Falha ao enviar registro para grupo de ENTRADAS:', envio.error);
      return { enviado: false, grupoJid, mensagem, motivo: envio.error || 'erro_envio' };
    }

    return { enviado: true, grupoJid, mensagem };
  } catch (err: any) {
    console.warn('[Entrada Estoque] Erro inesperado ao notificar grupo de ENTRADAS:', err?.message || err);
    return { enviado: false, motivo: err?.message || 'erro_inesperado' };
  }
}
