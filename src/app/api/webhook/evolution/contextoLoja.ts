import type { SupabaseClient } from '@supabase/supabase-js';

/** Formata um valor em reais para as mensagens do bot. */
function moeda(valor: number): string {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

/**
 * Resumo compacto dos dados reais da loja para o prompt do extrator de comando.
 *
 * Antes, o extrator recebia só o nome da loja: ele tinha que adivinhar que "Lu"
 * é o Lucas Silva e que "15pm" é o iPhone 15 Pro Max. Com a lista de nomes e
 * modelos que a loja realmente tem, ele devolve o valor cadastrado — e o
 * casamento no banco passa a acertar de primeira.
 *
 * O texto é propositalmente curto: entra em toda chamada, então cada linha custa
 * token. Nomes e modelos, sem preço nem detalhe.
 */
export async function montarDadosLojaParaPrompt(
  supabase: SupabaseClient,
  lojaId: string
): Promise<string | undefined> {
  try {
    const [estoque, clientes, compradores] = await Promise.all([
      supabase
        .from('aparelhos')
        .select('marca, modelo, capacidade, cor')
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .limit(120),
      supabase.from('clientes').select('nome').eq('loja_id', lojaId).limit(80),
      supabase
        .from('compradores_frequentes')
        .select('nome')
        .eq('loja_id', lojaId)
        .order('total_compras', { ascending: false })
        .limit(40),
    ]);

    const partes: string[] = [];

    const modelos = [
      ...new Set(
        ((estoque.data || []) as Record<string, unknown>[])
          .map((a) =>
            [a.marca, a.modelo, a.capacidade].filter(Boolean).join(' ').trim()
          )
          .filter(Boolean)
      ),
    ];
    if (modelos.length > 0) {
      partes.push(`Modelos em estoque: ${modelos.slice(0, 60).join(' | ')}`);
    }

    const nomes = [
      ...new Set(
        [
          ...((compradores.data || []) as Record<string, unknown>[]),
          ...((clientes.data || []) as Record<string, unknown>[]),
        ]
          .map((c) => String(c.nome || '').trim())
          .filter(Boolean)
      ),
    ];
    if (nomes.length > 0) {
      partes.push(`Clientes/compradores cadastrados: ${nomes.slice(0, 60).join(' | ')}`);
    }

    return partes.length > 0 ? partes.join('\n') : undefined;
  } catch (err) {
    console.warn('[Contexto] Falha ao montar dados da loja:', err);
    return undefined;
  }
}

/** Campos que carregam o valor financeiro de uma ação. */
const CAMPOS_VALOR = ['valor', 'novoValor', 'preco', 'novoPreco', 'valorVenda'];

/**
 * Devolve a mensagem de confirmação quando a ação movimenta um valor acima do
 * limite configurado pela loja (`configuracoes.limite_aprovacao_manual`), ou
 * `null` quando pode executar direto.
 *
 * O limite já existia, mas só o atalho !vender o respeitava: uma venda ditada em
 * linguagem natural era gravada sem qualquer conferência.
 */
export async function exigirConfirmacaoPorValor(
  supabase: SupabaseClient,
  lojaId: string,
  ehEscrita: boolean,
  tituloAcao: string,
  params: Record<string, unknown>
): Promise<string | null> {
  if (!ehEscrita) return null;

  let valor = 0;
  for (const campo of CAMPOS_VALOR) {
    const bruto = params[campo];
    if (bruto === undefined || bruto === null || bruto === '') continue;
    const n = Number(
      String(bruto)
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}\b)/g, '')
        .replace(',', '.')
    );
    if (Number.isFinite(n) && n > valor) valor = n;
  }

  if (valor <= 0) return null;

  try {
    const { data } = await supabase
      .from('lojas')
      .select('configuracoes')
      .eq('id', lojaId)
      .maybeSingle();

    const limite = Number(
      (data?.configuracoes as Record<string, unknown> | null)?.limite_aprovacao_manual || 0
    );
    if (limite <= 0 || valor <= limite) return null;

    const detalhes = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => `• ${k}: ${v}`)
      .join('\n');

    return (
      `⚠️ *Confirma esta operação?*\n\n` +
      `${tituloAcao} — *${moeda(valor)}*\n` +
      `(acima do seu limite de ${moeda(limite)})\n\n` +
      `${detalhes}\n\n` +
      `Responda *sim* para confirmar ou *não* para cancelar.`
    );
  } catch (err) {
    console.warn('[Confirmação] Falha ao ler limite da loja:', err);
    return null;
  }
}
