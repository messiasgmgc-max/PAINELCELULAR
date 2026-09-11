import type { SupabaseClient } from '@supabase/supabase-js';
import { EstadoCicloAparelho, ehAparelhoDeCliente, ehEstadoAmbiguoLegado, estaNoEstoque, patchRestauracao, patchSaida } from './ciclo';
import { aplicarMudancaEstoque, gerarLoteId, registrarEntradaEstoque } from './movimentacoes';

/**
 * Remontagem do estoque a partir de uma lista colada do MercadoPhone.
 *
 * INCIDENTE (10/09/2026, 09:16:38 BRT): a remontagem dava baixa em TUDO que
 * estava ativo e não aparecia na lista. Uma lista com 1 item casado baixou 112
 * aparelhos (R$ 43 mil) sem nenhuma confirmação.
 *
 * O fluxo agora é planejar → confirmar → executar. O plano é puro e testável;
 * a trava de sanidade é avaliada no plano e reavaliada no executor, para que um
 * botão mal ligado na tela não consiga pular a proteção.
 */

export interface ItemListaImportada {
  raw?: string;
  idEtiqueta: string;
  /** false quando o parser gerou um ID aleatório porque a linha não tinha ID. */
  idEtiquetaInformado?: boolean;
  marca?: string;
  modelo: string;
  capacidade?: string;
  cor?: string;
  condicao?: 'novo' | 'seminovo';
  bateria?: string;
  sufixoSerial?: string;
  observacoes?: string;
  custo: number;
  preco: number;
  isCellular?: boolean;
}

export interface AparelhoRemontagem extends EstadoCicloAparelho {
  id: string;
  modelo?: string | null;
  imei?: string | null;
  numeroSerie?: string | null;
  observacoes?: string | null;
  custo?: number | null;
}

/** A baixa em massa é bloqueada acima desta fração do estoque ativo. */
export const LIMITE_PROPORCAO_BAIXA = 0.3;
/** Abaixo deste tamanho de estoque a regra de proporção não se aplica (3 de 5 já seria 60%). */
export const ESTOQUE_MINIMO_PARA_PROPORCAO = 10;

export interface TravaBaixa {
  bloqueada: boolean;
  motivo?: string;
}

export function avaliarTravaBaixa(params: {
  baixas: number;
  itensImportados: number;
  ativos: number;
}): TravaBaixa {
  const { baixas, itensImportados, ativos } = params;
  if (baixas <= 0) return { bloqueada: false };

  if (itensImportados <= 0) {
    return { bloqueada: true, motivo: 'A lista colada não tem nenhum aparelho reconhecido.' };
  }

  if (baixas > itensImportados) {
    return {
      bloqueada: true,
      motivo:
        `A lista tem ${itensImportados} aparelho(s), mas ${baixas} sairiam do estoque. ` +
        'A lista colada parece incompleta — uma lista pequena não pode esvaziar um estoque grande.',
    };
  }

  if (ativos >= ESTOQUE_MINIMO_PARA_PROPORCAO && baixas / ativos > LIMITE_PROPORCAO_BAIXA) {
    const pct = Math.round((baixas / ativos) * 100);
    return {
      bloqueada: true,
      motivo:
        `${baixas} de ${ativos} aparelhos ativos (${pct}%) sairiam do estoque, acima do limite de ` +
        `${Math.round(LIMITE_PROPORCAO_BAIXA * 100)}%. A lista colada parece incompleta.`,
    };
  }

  return { bloqueada: false };
}

function somenteDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Procura o aparelho do banco que corresponde a um item da lista.
 *
 * Mais restritivo que a versão anterior:
 *  - ID de etiqueta gerado aleatoriamente pelo parser nunca é usado para casar;
 *  - a busca em observações exige a marca exata `ID: <id>`, não um trecho solto;
 *  - final de IMEI só casa se apontar para UM aparelho (4 dígitos repetem);
 *  - um aparelho já casado com outro item da lista não é reutilizado.
 */
export function encontrarEquivalente(
  item: ItemListaImportada,
  aparelhos: AparelhoRemontagem[],
  obterCodigo: (a: AparelhoRemontagem) => string,
  jaUsados: Set<string> = new Set()
): AparelhoRemontagem | undefined {
  const livres = aparelhos.filter((a) => !jaUsados.has(a.id));
  const id = somenteDigitos(item.idEtiqueta);
  const idConfiavel = item.idEtiquetaInformado !== false && id.length >= 6;

  if (idConfiavel) {
    const porCodigo = livres.find((a) => {
      const cod = somenteDigitos(obterCodigo(a));
      return cod.length >= 6 && (cod === id || cod.endsWith(id) || id.endsWith(cod));
    });
    if (porCodigo) return porCodigo;

    const porSerie = livres.find((a) => somenteDigitos(a.numeroSerie) === id);
    if (porSerie) return porSerie;

    const marca = new RegExp(`\\bID:\\s*${id}\\b`);
    const porObservacao = livres.find((a) => marca.test(String(a.observacoes || '')));
    if (porObservacao) return porObservacao;
  }

  const serial = String(item.sufixoSerial || '').trim();
  if (item.isCellular !== false && serial.length >= 3) {
    const exato = livres.find((a) => String(a.imei || '') === serial);
    if (exato) return exato;

    const porFinal = livres.filter((a) => a.imei && String(a.imei).endsWith(serial));
    if (porFinal.length === 1) return porFinal[0];
  }

  return undefined;
}

export interface PlanoRemontagem {
  itensImportados: number;
  ativosAtuais: number;
  /** Aparelhos da lista que já existem e seguem/voltam para o estoque. */
  atualizar: Array<{ item: ItemListaImportada; aparelho: AparelhoRemontagem; reativa: boolean }>;
  /** Itens da lista sem correspondente: viram cadastros novos. */
  criar: ItemListaImportada[];
  /** Itens que casaram com um aparelho vendido de verdade: não são reativados. */
  conflitosVendidos: Array<{ item: ItemListaImportada; aparelho: AparelhoRemontagem }>;
  /** Ativos que não estão na lista e sairiam do estoque. */
  baixar: AparelhoRemontagem[];
  /** Ativos fora da lista mas em manutenção: nunca são baixados por remontagem. */
  preservadosManutencao: AparelhoRemontagem[];
  trava: TravaBaixa;
}

export function planejarRemontagem(params: {
  itens: ItemListaImportada[];
  aparelhos: AparelhoRemontagem[];
  obterCodigo: (a: AparelhoRemontagem) => string;
}): PlanoRemontagem {
  const { itens, aparelhos, obterCodigo } = params;
  const ativos = aparelhos.filter((a) => estaNoEstoque(a));
  const usados = new Set<string>();

  const atualizar: PlanoRemontagem['atualizar'] = [];
  const criar: ItemListaImportada[] = [];
  const conflitosVendidos: PlanoRemontagem['conflitosVendidos'] = [];

  for (const item of itens) {
    const equivalente = encontrarEquivalente(item, aparelhos, obterCodigo, usados);
    if (!equivalente) {
      criar.push(item);
      continue;
    }

    usados.add(equivalente.id);

    // Venda concluída não ressuscita por causa de uma lista colada: uma das duas
    // fontes está errada e isso precisa ser conferido por uma pessoa.
    // O legado ambíguo (desativado com a condição antiga de venda) também: só a
    // conferência física diz se ele está mesmo na loja.
    if (equivalente.status === 'vendido' || ehEstadoAmbiguoLegado(equivalente) || ehAparelhoDeCliente(equivalente)) {
      conflitosVendidos.push({ item, aparelho: equivalente });
      continue;
    }

    atualizar.push({ item, aparelho: equivalente, reativa: !estaNoEstoque(equivalente) });
  }

  const foraDaLista = ativos.filter((a) => !usados.has(a.id));
  const preservadosManutencao = foraDaLista.filter((a) => a.status === 'manutencao');
  const baixar = foraDaLista.filter((a) => a.status !== 'manutencao');

  return {
    itensImportados: itens.length,
    ativosAtuais: ativos.length,
    atualizar,
    criar,
    conflitosVendidos,
    baixar,
    preservadosManutencao,
    trava: avaliarTravaBaixa({ baixas: baixar.length, itensImportados: itens.length, ativos: ativos.length }),
  };
}

export interface ResultadoRemontagem {
  loteId: string;
  atualizados: number;
  reativados: number;
  criados: number;
  /** Aparelhos cadastrados nesta execução (o estoque oferece as etiquetas deles). */
  idsCriados: string[];
  /** Aparelhos existentes que a lista atualizou ou reativou. */
  idsAtualizados: string[];
  baixados: number;
  baixaBloqueada: boolean;
  motivoBloqueio?: string;
  conflitosVendidos: number;
  auditoriaCompleta: boolean;
  errosAuditoria: string[];
}

export interface DependenciasRemontagem {
  lojaId: string | null;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  /** Cadastra um aparelho novo e devolve a linha criada (id, loja_id, ativo, status, condicao). */
  criarAparelho: (item: ItemListaImportada) => Promise<EstadoCicloAparelho | null>;
  /** Campos cadastrais (não de ciclo) a gravar num aparelho existente a partir do item. */
  dadosCadastrais: (item: ItemListaImportada, aparelho: AparelhoRemontagem) => Record<string, unknown>;
  /** Grava o resumo em logs_sistema. Injetado para o executor não depender do cliente global. */
  registrarLog: (params: {
    loja_id?: string | null;
    usuario_id?: string | null;
    usuario_nome?: string | null;
    tipo_evento: 'estoque';
    acao: string;
    detalhes?: string | null;
    valor_anterior?: unknown;
    valor_novo?: unknown;
  }) => Promise<void>;
}

export async function executarPlanoRemontagem(
  supabase: SupabaseClient,
  plano: PlanoRemontagem,
  opcoes: {
    incluirBaixa: boolean;
    /** 'importar_mercadophone' só cadastra e atualiza: nunca dá baixa. */
    origem?: 'remontar_mercadophone' | 'importar_mercadophone';
  },
  deps: DependenciasRemontagem
): Promise<ResultadoRemontagem> {
  const origem = opcoes.origem || 'remontar_mercadophone';
  const permiteBaixa = origem === 'remontar_mercadophone' && opcoes.incluirBaixa;
  const loteId = gerarLoteId();
  const contexto = {
    loteId,
    lojaId: deps.lojaId,
    usuarioId: deps.usuarioId,
    usuarioNome: deps.usuarioNome,
  };
  const errosAuditoria: string[] = [];
  let atualizados = 0;
  let reativados = 0;
  const idsAtualizados: string[] = [];

  for (const { item, aparelho, reativa } of plano.atualizar) {
    const dados = deps.dadosCadastrais(item, aparelho);
    const patch = reativa ? { ...dados, ...patchRestauracao() } : dados;

    const r = await aplicarMudancaEstoque(supabase, {
      ...contexto,
      ids: [aparelho.id],
      patch,
      tipo: reativa ? 'restauracao' : 'edicao',
      origem,
      camposAuditados: ['preco', 'custo', 'modelo'],
      observacao: reativa ? 'Reativado: consta na lista colada do MercadoPhone.' : 'Atualizado pela lista do MercadoPhone.',
      // Revalida no banco: nem um plano adulterado reativa vendido ou legado ambíguo.
      filtroElegivel: (estado) => estado.status !== 'vendido' && !ehEstadoAmbiguoLegado(estado) && !ehAparelhoDeCliente(estado),
    });
    if (!r.auditoriaRegistrada && r.erroAuditoria) errosAuditoria.push(r.erroAuditoria);
    atualizados += r.afetados;
    if (reativa) reativados += r.afetados;
    if (r.afetados > 0) idsAtualizados.push(aparelho.id);
  }

  const criadosLinhas: EstadoCicloAparelho[] = [];
  for (const item of plano.criar) {
    const criado = await deps.criarAparelho(item);
    if (criado?.id) criadosLinhas.push(criado);
  }
  if (criadosLinhas.length > 0) {
    const r = await registrarEntradaEstoque(supabase, {
      ...contexto,
      aparelhos: criadosLinhas,
      origem,
      observacao: 'Cadastrado pela lista do MercadoPhone.',
    });
    if (!r.auditoriaRegistrada && r.erroAuditoria) errosAuditoria.push(r.erroAuditoria);
  }

  // A trava é reavaliada com os números do próprio plano: não confiamos só no
  // campo `trava` recebido, que poderia ter vindo de um plano adulterado.
  const trava = avaliarTravaBaixa({
    baixas: plano.baixar.length,
    itensImportados: plano.itensImportados,
    ativos: plano.ativosAtuais,
  });
  const baixaBloqueada = trava.bloqueada || plano.trava.bloqueada;

  let baixados = 0;
  if (permiteBaixa && !baixaBloqueada && plano.baixar.length > 0) {
    const r = await aplicarMudancaEstoque(supabase, {
      ...contexto,
      ids: plano.baixar.map((a) => a.id),
      patch: patchSaida('baixado', 'baixa_massa'),
      tipo: 'baixa',
      origem,
      observacao: `Baixa em massa: ausentes da lista do MercadoPhone (${plano.itensImportados} itens na lista).`,
    });
    if (!r.auditoriaRegistrada && r.erroAuditoria) errosAuditoria.push(r.erroAuditoria);
    baixados = r.afetados;
  }

  const resultado: ResultadoRemontagem = {
    loteId,
    atualizados,
    reativados,
    criados: criadosLinhas.length,
    idsCriados: criadosLinhas.map((a) => String(a.id)),
    idsAtualizados,
    baixados,
    baixaBloqueada: permiteBaixa && baixaBloqueada,
    motivoBloqueio: baixaBloqueada ? trava.motivo || plano.trava.motivo : undefined,
    conflitosVendidos: plano.conflitosVendidos.length,
    auditoriaCompleta: errosAuditoria.length === 0,
    errosAuditoria,
  };

  await deps.registrarLog({
    loja_id: deps.lojaId,
    usuario_id: deps.usuarioId,
    usuario_nome: deps.usuarioNome,
    tipo_evento: 'estoque',
    acao:
      origem === 'importar_mercadophone'
        ? 'Importação de lista (MercadoPhone)'
        : baixados > 0
          ? 'Baixa em massa (Remontar MercadoPhone)'
          : 'Remontagem de estoque (MercadoPhone)',
    detalhes:
      `Lote ${loteId}: lista com ${plano.itensImportados} itens; ${atualizados} atualizados ` +
      `(${reativados} reativados), ${resultado.criados} criados, ${baixados} baixados` +
      (resultado.baixaBloqueada ? ` — BAIXA BLOQUEADA: ${resultado.motivoBloqueio}` : '') +
      (plano.conflitosVendidos.length ? `; ${plano.conflitosVendidos.length} conflito(s) com vendidos` : ''),
    valor_anterior: {
      ativos: plano.ativosAtuais,
      aparelhos_para_baixa: plano.baixar.length,
    },
    valor_novo: {
      lote_id: loteId,
      atualizados,
      reativados,
      criados: resultado.criados,
      baixados,
      baixa_bloqueada: resultado.baixaBloqueada,
      ids_baixados: baixados > 0 ? plano.baixar.map((a) => a.id) : [],
    },
  });

  return resultado;
}
