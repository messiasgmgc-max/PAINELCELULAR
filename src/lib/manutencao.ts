export interface DadosManutencao {
  emManutencao: boolean;
  tecnicoId?: string;
  tecnicoNome?: string;
  dataEnvio?: string;
  motivo?: string;
  previsaoRetorno?: string;
  custoManutencao?: number;
}

/**
 * Extrai dados consolidados de manutenção de um aparelho,
 * verificando colunas nativas e tags estruturadas em 'observacoes'.
 */
export function extrairDadosManutencao(aparelho: any): DadosManutencao {
  if (!aparelho) {
    return { emManutencao: false };
  }

  const obs = String(aparelho.observacoes || '');
  const isStatusManutencao = aparelho.status === 'manutencao';

  // Procura tag estruturada [MANUTENCAO:...]
  const matchTag = obs.match(/\[MANUTENCAO:([^\]]+)\]/i);
  let tagParams: Record<string, string> = {};

  if (matchTag && matchTag[1]) {
    const parts = matchTag[1].split('|');
    for (const part of parts) {
      const [k, ...v] = part.split('=');
      if (k) {
        tagParams[k.trim().toLowerCase()] = v.join('=').trim();
      }
    }
  }

  // Verifica se há tag de retorno posterior
  const indexManutencao = obs.lastIndexOf('[MANUTENCAO:');
  const indexRetorno = obs.lastIndexOf('[RETORNO_MANUTENCAO:');
  const retornouPosteriormente = indexRetorno > indexManutencao;

  const emManutencao =
    (isStatusManutencao && !retornouPosteriormente) ||
    (Boolean(matchTag) && !retornouPosteriormente && tagParams.status === 'com_tecnico');

  const tecnicoId = aparelho.tecnico_id || tagParams.tecnico_id || undefined;
  const tecnicoNome = aparelho.tecnico_nome || tagParams.tecnico_nome || (emManutencao ? 'Técnico Externo' : undefined);
  const dataEnvio = aparelho.data_manutencao || tagParams.data || undefined;
  const motivo = aparelho.motivo_manutencao || tagParams.motivo || undefined;
  const previsaoRetorno = tagParams.previsao || undefined;
  const custoManutencao = Number(aparelho.custo_manutencao || tagParams.custo || 0);

  return {
    emManutencao,
    tecnicoId,
    tecnicoNome,
    dataEnvio,
    motivo,
    previsaoRetorno,
    custoManutencao,
  };
}

/**
 * Monta a string estruturada para salvar em 'observacoes' ao despachar para manutenção.
 */
export function montarTagManutencao(params: {
  tecnicoId?: string;
  tecnicoNome: string;
  motivo: string;
  dataEnvio: string;
  previsaoRetorno?: string;
}): string {
  const parts = [
    'status=com_tecnico',
    `tecnico_id=${params.tecnicoId || ''}`,
    `tecnico_nome=${params.tecnicoNome.replace(/[|\]]/g, '')}`,
    `data=${params.dataEnvio}`,
    `motivo=${params.motivo.replace(/[|\]]/g, '')}`,
  ];

  if (params.previsaoRetorno) {
    parts.push(`previsao=${params.previsaoRetorno}`);
  }

  return `[MANUTENCAO:${parts.join('|')}]`;
}

/**
 * Monta a string estruturada para salvar em 'observacoes' ao retornar da manutenção.
 */
export function montarTagRetornoManutencao(params: {
  tecnicoNome?: string;
  custoReparo?: number;
  dataRetorno: string;
  solucao?: string;
}): string {
  const parts = [
    `data=${params.dataRetorno}`,
    `tecnico=${(params.tecnicoNome || '').replace(/[|\]]/g, '')}`,
    `custo=${params.custoReparo || 0}`,
    `solucao=${(params.solucao || '').replace(/[|\]]/g, '')}`,
  ];

  return `[RETORNO_MANUTENCAO:${parts.join('|')}]`;
}

/**
 * Verifica rapidamente se o aparelho está sob custódia de um técnico
 */
export function isAparelhoEmManutencao(aparelho: any): boolean {
  return extrairDadosManutencao(aparelho).emManutencao;
}
