import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ação que o bot deixou "em espera" aguardando o lojista completar um dado ou
 * confirmar. Sem isso, a conversa abaixo não funcionava:
 *
 *   — vendi o 13 pro pro Lucas
 *   — Qual o valor dessa venda?
 *   — 2500                       <- chegava como mensagem solta, sem contexto
 */
export interface AcaoPendente {
  tipo: 'faltando_dados' | 'confirmacao';
  action: string;
  params: Record<string, unknown>;
  resumo?: string;
  criadoEm: number;
}

/** Depois disso o lojista já está falando de outra coisa. */
export const VALIDADE_PENDENCIA_MS = 10 * 60 * 1000;

export function chavePendencia(remoteJid: string, telefone: string): string {
  return `${remoteJid}:${telefone}`;
}

export async function salvarPendencia(
  supabase: SupabaseClient,
  chave: string,
  lojaId: string | null,
  pendencia: Omit<AcaoPendente, 'criadoEm'>
): Promise<void> {
  try {
    await supabase.from('whatsapp_acoes_pendentes').upsert(
      {
        chave,
        loja_id: lojaId,
        tipo: pendencia.tipo,
        action: pendencia.action,
        params: pendencia.params,
        resumo: pendencia.resumo || null,
        criado_em: new Date().toISOString(),
      },
      { onConflict: 'chave' }
    );
  } catch (err) {
    console.warn('[Pendência] Falha ao salvar:', err);
  }
}

export async function obterPendencia(
  supabase: SupabaseClient,
  chave: string
): Promise<AcaoPendente | null> {
  try {
    const { data } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('tipo, action, params, resumo, criado_em')
      .eq('chave', chave)
      .maybeSingle();

    if (!data?.criado_em) return null;

    const criadoEm = new Date(data.criado_em).getTime();
    if (Date.now() - criadoEm > VALIDADE_PENDENCIA_MS) return null;

    return {
      tipo: data.tipo as AcaoPendente['tipo'],
      action: String(data.action),
      params: (data.params || {}) as Record<string, unknown>,
      resumo: data.resumo || undefined,
      criadoEm,
    };
  } catch (err) {
    console.warn('[Pendência] Falha ao ler:', err);
    return null;
  }
}

export async function limparPendencia(supabase: SupabaseClient, chave: string): Promise<void> {
  try {
    await supabase.from('whatsapp_acoes_pendentes').delete().eq('chave', chave);
  } catch (err) {
    console.warn('[Pendência] Falha ao limpar:', err);
  }
}

const AFIRMACOES = [
  'sim', 's', 'isso', 'confirma', 'confirmar', 'confirmado', 'pode', 'podeser',
  'pode ser', 'ok', 'okay', 'blz', 'beleza', 'certo', 'exato', 'positivo',
  'manda', 'manda ver', 'bora', 'vai', 'fecha', 'fechado', 'aham', 'uhum',
  'com certeza', 'claro', 'perfeito', 'isso mesmo', 'ta certo', 'tá certo',
];

const NEGACOES = [
  'nao', 'não', 'n', 'cancela', 'cancelar', 'cancelado', 'para', 'pare',
  'esquece', 'deixa', 'deixa pra la', 'negativo', 'errado', 'nada',
  'nem', 'melhor nao', 'melhor não',
];

function normalizarResposta(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpreta a resposta a um pedido de confirmação.
 *
 * Só considera sim/não quando a mensagem é curta e direta: "sim" confirma, mas
 * "sim, mas muda pra 2600" é outra coisa — devolve `indefinido` para a mensagem
 * seguir o fluxo normal e virar uma nova intenção.
 */
export function interpretarConfirmacao(texto: string): 'sim' | 'nao' | 'indefinido' {
  const limpo = normalizarResposta(texto);
  if (!limpo) return 'indefinido';

  const palavras = limpo.split(' ');
  if (palavras.length > 4) return 'indefinido';

  if (AFIRMACOES.includes(limpo) || (palavras.length <= 2 && palavras.every((p) => AFIRMACOES.includes(p)))) {
    return 'sim';
  }
  if (NEGACOES.includes(limpo) || (palavras.length <= 2 && palavras.every((p) => NEGACOES.includes(p)))) {
    return 'nao';
  }
  return 'indefinido';
}

/**
 * Junta os parâmetros novos aos que já estavam pendentes. Os novos vencem, mas
 * um campo ausente ou vazio não apaga o que já tínhamos.
 */
export function mesclarParams(
  anteriores: Record<string, unknown>,
  novos: Record<string, unknown>
): Record<string, unknown> {
  const resultado = { ...anteriores };
  for (const [chave, valor] of Object.entries(novos)) {
    if (valor === undefined || valor === null || String(valor).trim() === '') continue;
    resultado[chave] = valor;
  }
  return resultado;
}
