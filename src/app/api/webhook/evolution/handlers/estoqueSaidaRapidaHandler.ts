import type { SupabaseClient } from '@supabase/supabase-js';
import { estaNoEstoque, patchSaida } from '@/lib/estoque/ciclo';
import { bateriaParaLista, getEmojiItem } from '@/lib/estoque/listaWhatsapp';
import { aplicarMudancaEstoque } from '@/lib/estoque/movimentacoes';
import { montarTagManutencao } from '@/lib/manutencao';
import { getAparelhoCodigo } from '@/lib/utils';

export interface DadosVendaAtacadoRecente {
  vendaUuid: string;
  vendaCodigo: string;
  clienteNome: string;
  custoTotal: number;
  metodo: string;
  valorAtual: number;
  criadoEm: number;
}

export interface ComandoSaidaDiretaEstoque {
  imei: string;
  tipo: 'manutencao' | 'baixa';
  destinoOuMotivo: string;
}

const MAX_IDADE_EDICAO_REPLY_MS = 60 * 60 * 1000; // 60 minutos com reply direto
const MAX_IDADE_EDICAO_DIRETA_MS = 10 * 60 * 1000; // 10 minutos sem reply quando valor era 0

export function parseValorEdicaoRapida(texto: string): number | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpo = texto.trim();
  if (!limpo || limpo.length > 40) return null;

  const match =
    limpo.match(/^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*reais)?$/i) ||
    limpo.match(
      /^(?:o\s+)?(?:valor|pre[cç]o)(?:\s+(?:[eé]|certo|correto|novo|final))?\s*[:=-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*reais)?$/i
    ) ||
    limpo.match(
      /^(?:coloca|atualiza|muda|altera|bota)(?:\s+(?:para|pra|pro))?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*reais)?$/i
    );

  if (!match) return null;
  const bruto = match[1];
  const digitos = bruto.replace(/\D/g, '');
  if (digitos.length >= 7) return null; // Protege contra IMEI

  const num = bruto.includes(',')
    ? parseFloat(bruto.replace(/\./g, '').replace(',', '.'))
    : /^\d+\.\d{1,2}$/.test(bruto)
      ? parseFloat(bruto)
      : parseFloat(bruto.replace(/\./g, ''));

  if (Number.isNaN(num) || num <= 0 || num >= 100000) return null;
  return num;
}

/**
 * Salva os metadados de uma venda de atacado recém-registrada para permitir
 * edição rápida do valor via reply (ou mensagem logo abaixo quando ficou R$ 0,00).
 */
export async function salvarVendaAtacadoRecente(
  supabase: SupabaseClient,
  lojaId: string,
  remoteJid: string,
  messageId: string | undefined,
  dados: Omit<DadosVendaAtacadoRecente, 'criadoEm'>
): Promise<void> {
  if (!lojaId || !remoteJid || !dados.vendaUuid || typeof (supabase as any).from !== 'function') {
    return;
  }

  const agora = Date.now();
  const payload = {
    loja_id: lojaId,
    tipo: 'confirmacao' as const,
    action: 'editar_venda_atacado',
    params: { ...dados, criadoEm: agora } as any,
    resumo: `Venda atacado #${dados.vendaCodigo} - ${dados.clienteNome}`,
    criado_em: new Date(agora).toISOString(),
  };

  const chaves = Array.from(
    new Set(
      [
        messageId ? `atacado_venda:${remoteJid}:${messageId}` : null,
        `atacado_venda:${remoteJid}:ultima`,
      ].filter((c): c is string => Boolean(c))
    )
  );

  try {
    await Promise.all(
      chaves.map((chave) =>
        supabase.from('whatsapp_acoes_pendentes').upsert(
          { ...payload, chave },
          { onConflict: 'chave' }
        )
      )
    );
  } catch (err) {
    console.warn('[Atacado Edição Rápida] Erro ao salvar cache da venda:', err);
  }
}

/**
 * Atualiza o valor de uma venda de atacado recente quando o usuário responde
 * à mensagem do bot ou envia o valor logo em seguida (quando o valor estava 0).
 */
export async function tentarEditarValorVendaAtacado(params: {
  supabase: SupabaseClient;
  lojaId: string;
  remoteJid: string;
  quotedStanzaId?: string;
  texto: string;
}): Promise<{ editado: boolean; mensagem?: string }> {
  const { supabase, lojaId, remoteJid, quotedStanzaId, texto } = params;
  const novoValor = parseValorEdicaoRapida(texto);
  if (novoValor === null || !lojaId || !remoteJid) {
    return { editado: false };
  }

  const chaves = quotedStanzaId
    ? [`atacado_venda:${remoteJid}:${quotedStanzaId}`]
    : [`atacado_venda:${remoteJid}:ultima`];

  try {
    const { data: registros } = await supabase
      .from('whatsapp_acoes_pendentes')
      .select('chave, params, criado_em')
      .in('chave', chaves)
      .eq('tipo', 'confirmacao')
      .order('criado_em', { ascending: false })
      .limit(4);

    if (!Array.isArray(registros) || registros.length === 0) {
      return { editado: false };
    }

    const agora = Date.now();
    const registroAlvo =
      (quotedStanzaId
        ? registros.find((r: any) => r.chave === `atacado_venda:${remoteJid}:${quotedStanzaId}`)
        : null) || registros[0];

    const dados = (registroAlvo as any)?.params as DadosVendaAtacadoRecente | undefined;
    if (!dados?.vendaUuid) return { editado: false };

    const criado = dados.criadoEm || new Date((registroAlvo as any).criado_em || 0).getTime();
    const idade = agora - criado;

    const foiReplyDireto = Boolean(
      quotedStanzaId && registroAlvo.chave === `atacado_venda:${remoteJid}:${quotedStanzaId}`
    );

    if (foiReplyDireto) {
      if (idade > MAX_IDADE_EDICAO_REPLY_MS) return { editado: false };
    } else {
      if (Number(dados.valorAtual || 0) > 0 || idade > MAX_IDADE_EDICAO_DIRETA_MS) {
        return { editado: false };
      }
    }

    const { data: vendaAtual } = await supabase
      .from('vendas')
      .select('id, valor, custo, metodo, itens')
      .eq('id', dados.vendaUuid)
      .eq('loja_id', lojaId)
      .maybeSingle();

    if (!vendaAtual) return { editado: false };

    const custo = Number(vendaAtual.custo ?? dados.custoTotal ?? 0);
    const lucro = Number((novoValor - custo).toFixed(2));
    const percentualLucro = custo > 0 ? Number(((lucro / custo) * 100).toFixed(2)) : 0;
    const metodo = String(vendaAtual.metodo || dados.metodo || 'pix');
    const isFiado = metodo === 'fiado';

    let itensAtualizados = Array.isArray(vendaAtual.itens) ? [...vendaAtual.itens] : [];
    if (itensAtualizados.length === 1) {
      itensAtualizados = [
        {
          ...itensAtualizados[0],
          valorExibir: novoValor,
          total: novoValor,
        },
      ];
    } else if (itensAtualizados.length > 1) {
      const unitPadrao = Number((novoValor / itensAtualizados.length).toFixed(2));
      itensAtualizados = itensAtualizados.map((it: any, idx: number) => {
        const val =
          idx === itensAtualizados.length - 1
            ? Number((novoValor - unitPadrao * (itensAtualizados.length - 1)).toFixed(2))
            : unitPadrao;
        return { ...it, valorExibir: val, total: val };
      });
    }

    const { error } = await supabase
      .from('vendas')
      .update({
        valor: novoValor,
        lucro,
        percentualLucro,
        status: isFiado ? 'pendente' : 'pago',
        valorPago: isFiado ? 0 : novoValor,
        saldoDevedor: isFiado ? novoValor : 0,
        ...(itensAtualizados.length > 0 ? { itens: itensAtualizados } : {}),
      })
      .eq('id', dados.vendaUuid)
      .eq('loja_id', lojaId);

    if (error) {
      return {
        editado: true,
        mensagem: `⚠️ Não consegui atualizar o valor da venda #${dados.vendaCodigo}: ${error.message}`,
      };
    }

    const novosDados: DadosVendaAtacadoRecente = {
      ...dados,
      valorAtual: novoValor,
    };
    await Promise.all(
      registros.map((r: any) =>
        supabase.from('whatsapp_acoes_pendentes').upsert(
          {
            chave: r.chave,
            loja_id: lojaId,
            tipo: 'confirmacao',
            action: 'editar_venda_atacado',
            params: novosDados as any,
            resumo: `Venda atacado #${dados.vendaCodigo} - ${dados.clienteNome}`,
            criado_em: new Date(agora).toISOString(),
          },
          { onConflict: 'chave' }
        )
      )
    );

    const valorFmt = novoValor.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return {
      editado: true,
      mensagem: `✅ *Valor da venda de atacado (#${dados.vendaCodigo} - ${dados.clienteNome}) atualizado para R$ ${valorFmt}!*`,
    };
  } catch (err) {
    console.warn('[Atacado Edição Rápida] Erro ao atualizar valor:', err);
    return { editado: false };
  }
}

/**
 * Detecta comandos de saída direta no estoque por IMEI:
 * - `350015753668064 [MANUTENÇÃO "Carlos"]` ou `!manutencao 350015753668064 Carlos`
 * - `9911 [BAIXA "Defeito"]` / `9911 [DEVOLVIDO "Fornecedor"]` ou `!baixa 9911 Defeito`
 */
export function detectarSaidaDiretaEstoque(texto: string): ComandoSaidaDiretaEstoque | null {
  if (!texto || typeof texto !== 'string') return null;
  const limpo = texto.trim();

  // 1. Formato em colchetes: "IMEI [MANUTENÇÃO "Nome"]" ou "IMEI [BAIXA "Motivo"]"
  const matchColchete = limpo.match(
    /^(?:imei\s*[:=-]?\s*)?#?(\d{4,16})\s*\[\s*(manuten[cç][aã]o|baixa|devolvido|perda)(?:\s+["“']?([^\]"”']+)["”']?)?\s*\]$/i
  );
  if (matchColchete) {
    const tag = matchColchete[2].toLowerCase();
    const tipo: 'manutencao' | 'baixa' = tag.startsWith('manuten') ? 'manutencao' : 'baixa';
    const destinoOuMotivo = (matchColchete[3] || (tipo === 'manutencao' ? 'Técnico' : 'Baixa manual')).trim();
    return { imei: matchColchete[1], tipo, destinoOuMotivo };
  }

  // 2. Formato atalho explícito: "!manutencao IMEI Nome" ou "!baixa IMEI Motivo"
  const matchAtalho = limpo.match(
    /^!(manuten[cç][aã]o|baixa)\s+#?(\d{4,16})(?:\s+(.+))?$/i
  );
  if (matchAtalho) {
    const tag = matchAtalho[1].toLowerCase();
    const tipo: 'manutencao' | 'baixa' = tag.startsWith('manuten') ? 'manutencao' : 'baixa';
    const destinoOuMotivo = (matchAtalho[3] || (tipo === 'manutencao' ? 'Técnico' : 'Baixa manual'))
      .replace(/^["“']|["”']$/g, '')
      .trim();
    return { imei: matchAtalho[2], tipo, destinoOuMotivo };
  }

  return null;
}

function formatarResumoLinhaAparelho(ap: Record<string, any>): string {
  const emoji = getEmojiItem(ap);
  const modelo = String(ap.modelo || 'Aparelho').replace(/^Apple\s+/i, '').trim();
  const cap = ap.capacidade && !/^n\/a$/i.test(String(ap.capacidade)) ? String(ap.capacidade).trim() : '';
  const cor = String(ap.cor || '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .trim();
  const corLimpa = /^(?:padr[aã]o|n\/a)$/i.test(cor) ? '' : cor;
  const bat = bateriaParaLista(ap);
  const ident = String(ap.imei || '').trim() || getAparelhoCodigo(ap);
  const desc = [modelo, cap, corLimpa, bat].filter(Boolean).join(' ');
  return `${emoji} ${desc}${ident ? ` - ${ident}` : ''}`.replace(/\s+/g, ' ').trim();
}

/**
 * Executa a saída direta (manutenção ou baixa) no estoque mantendo a trilha de auditoria.
 */
export async function executarSaidaDiretaEstoque(
  supabase: SupabaseClient,
  lojaId: string,
  comando: ComandoSaidaDiretaEstoque,
  usuarioNome: string = 'Bot WhatsApp'
): Promise<string> {
  const imeiDigits = comando.imei.replace(/\D/g, '');
  const filtro =
    imeiDigits.length > 4
      ? `imei.eq.${imeiDigits},imei.ilike.%${imeiDigits},codigo.eq.${imeiDigits}`
      : `imei.eq.${imeiDigits},imei.ilike.%${imeiDigits}`;

  const { data: encontrados } = await supabase
    .from('aparelhos')
    .select('id, loja_id, marca, modelo, capacidade, cor, imei, codigo, saude_bateria, observacoes, ativo, status, condicao')
    .eq('loja_id', lojaId)
    .or(filtro)
    .limit(10);

  const ativos = ((encontrados || []) as Array<Record<string, any>>).filter((a) =>
    estaNoEstoque(a as any)
  );
  if (ativos.length === 0) {
    return `⚠️ Nenhum aparelho disponível no estoque encontrado para o IMEI/código *${comando.imei}*.`;
  }

  const alvo =
    ativos.find((a) => String(a.imei || '').replace(/\D/g, '') === imeiDigits) || ativos[0];

  const resumo = formatarResumoLinhaAparelho(alvo);
  const obsAnterior = String(alvo.observacoes || '').trim();

  if (comando.tipo === 'manutencao') {
    const tagManut = montarTagManutencao({
      tecnicoNome: comando.destinoOuMotivo,
      motivo: 'Saída rápida via WhatsApp',
      dataEnvio: new Date().toISOString(),
    });
    const novaObs = obsAnterior ? `${obsAnterior} | ${tagManut}` : tagManut;

    await aplicarMudancaEstoque(supabase, {
      ids: [alvo.id],
      patch: {
        status: 'manutencao',
        observacoes: novaObs,
      },
      tipo: 'edicao',
      origem: 'manutencao',
      lojaId,
      usuarioNome,
      observacao: `Enviado para manutenção (${comando.destinoOuMotivo}) via WhatsApp`,
      camposAuditados: ['observacoes'],
      filtroElegivel: estaNoEstoque,
    });

    return `🛠️ ${resumo} [MANUTENÇÃO "${comando.destinoOuMotivo}"]`;
  }

  const notaBaixa = `Baixa rápida via WhatsApp (${usuarioNome}): ${comando.destinoOuMotivo}`;
  const novaObs = obsAnterior ? `${obsAnterior} | ${notaBaixa}` : notaBaixa;

  await aplicarMudancaEstoque(supabase, {
    ids: [alvo.id],
    patch: {
      ...patchSaida('baixado', 'baixa_manual'),
      observacoes: novaObs,
    },
    tipo: 'baixa',
    origem: 'bot_whatsapp',
    lojaId,
    usuarioNome,
    observacao: `Baixa rápida via WhatsApp: ${comando.destinoOuMotivo}`,
    camposAuditados: ['observacoes'],
    filtroElegivel: estaNoEstoque,
  });

  return `❌ ${resumo} [BAIXA "${comando.destinoOuMotivo}"]`;
}
