/**
 * Ciclo de vida do aparelho no estoque.
 *
 * Duas colunas descreviam a mesma coisa e o código escrevia ora numa, ora na
 * outra: `status` (disponivel/vendido) e `condicao` (novo/seminovo/... e também
 * 'vendido'). Gravar 'vendido' em `condicao` destrói o estado físico do aparelho
 * e foi a assinatura do incidente de 10/09/2026, em que uma remontagem baixou
 * 112 aparelhos de uma vez.
 *
 * Regra a partir daqui:
 *  - `status`   = ciclo de vida: disponivel | vendido | baixado | manutencao | cliente
 *    ('cliente' = celular do cliente deixado para conserto na OS: não é da loja)
 *  - `condicao` = estado físico: novo | lacrado | seminovo | usado | danificado
 *    e NUNCA recebe 'vendido'.
 *  - Saída do estoque exige `ativo=false` junto de `status` vendido ou baixado,
 *    com `data_saida` e `motivo_saida` preenchidos.
 */

export const STATUS_APARELHO = ['disponivel', 'vendido', 'baixado', 'manutencao', 'cliente'] as const;
export type StatusAparelho = (typeof STATUS_APARELHO)[number];

export const MOTIVOS_SAIDA = ['venda', 'baixa_manual', 'baixa_massa', 'manutencao', 'perda'] as const;
export type MotivoSaida = (typeof MOTIVOS_SAIDA)[number];

export type TipoMovimentacao = 'entrada' | 'saida' | 'venda' | 'baixa' | 'restauracao' | 'edicao';

/**
 * Origem de uma movimentação. As sete primeiras vêm do roteiro de correção; as
 * demais cobrem os outros pontos do sistema que mexem em estoque. A coluna não
 * tem CHECK constraint, então novos valores não exigem migration.
 */
export type OrigemMovimentacao =
  | 'remontar_mercadophone'
  | 'importar_mercadophone'
  | 'deletar_estoque'
  | 'restaurar_estoque'
  | 'venda'
  | 'manual'
  | 'conferencia'
  | 'backup_restauracao'
  | 'desfazer_lote'
  | 'atacado'
  | 'manutencao'
  | 'devolucao'
  | 'bot_whatsapp';

/** Colunas que definem se e por que o aparelho está no estoque. */
export const CAMPOS_CICLO = ['ativo', 'status', 'condicao', 'data_saida', 'motivo_saida'] as const;

export interface EstadoCicloAparelho {
  id?: string;
  loja_id?: string | null;
  ativo?: boolean | null;
  status?: string | null;
  condicao?: string | null;
  data_saida?: string | null;
  motivo_saida?: string | null;
  [campo: string]: unknown;
}

export type PatchCiclo = {
  ativo?: boolean;
  status?: StatusAparelho;
  condicao?: string;
  data_saida?: string | null;
  motivo_saida?: MotivoSaida | null;
} & Record<string, unknown>;

/**
 * O aparelho está disponível para venda / conta no estoque?
 *
 * Tolera o legado: registros antigos ainda podem ter `condicao='vendido'`.
 * Manutenção continua contando como estoque (o aparelho é da loja, só está com
 * o técnico).
 */
export function estaNoEstoque(aparelho: EstadoCicloAparelho | null | undefined): boolean {
  if (!aparelho) return false;
  if (aparelho.ativo === false) return false;
  const status = aparelho.status || 'disponivel';
  if (status === 'vendido' || status === 'baixado' || status === 'cliente') return false;
  if (aparelho.condicao === 'vendido') return false;
  return true;
}

/**
 * Celular do cliente cadastrado para a OS. Antes entrava ativo e com preço 0: aparecia
 * no estoque, no PDV e na etiqueta como se fosse da loja. Nunca deve ser vendido,
 * baixado nem reativado por operação de estoque.
 */
export function ehAparelhoDeCliente(aparelho: EstadoCicloAparelho | null | undefined): boolean {
  return !!aparelho && aparelho.status === 'cliente';
}

/** Campos de ciclo para cadastrar o celular do cliente na OS. */
export function patchAparelhoDeCliente(): PatchCiclo {
  return { ativo: false, status: 'cliente', data_saida: null, motivo_saida: null };
}

/**
 * Assinatura dos aparelhos baixados por engano em remontagens antigas:
 * `ativo=false` + `status='disponivel'` + `condicao='vendido'`. É uma combinação
 * impossível pelas regras novas, e só a conferência física resolve cada um.
 * Nenhuma operação em massa deve reativá-los.
 */
export function ehEstadoAmbiguoLegado(aparelho: EstadoCicloAparelho | null | undefined): boolean {
  if (!aparelho) return false;
  return (
    aparelho.ativo === false &&
    (aparelho.status || 'disponivel') === 'disponivel' &&
    aparelho.condicao === 'vendido'
  );
}

/**
 * Recusa escritas que quebrariam o ciclo de vida. Falhar alto aqui é o que
 * impede o próximo bug de repetir o incidente em silêncio.
 */
export function validarPatchCiclo(patch: Record<string, unknown>): void {
  if (patch.condicao === 'vendido') {
    throw new Error("Escrita recusada: 'condicao' nunca recebe 'vendido'. Use status='vendido' com ativo=false.");
  }

  const status = patch.status as string | undefined;
  if (status !== undefined && !(STATUS_APARELHO as readonly string[]).includes(status)) {
    throw new Error(`Escrita recusada: status '${status}' não pertence ao ciclo de vida.`);
  }

  if (patch.ativo === false && status !== 'vendido' && status !== 'baixado' && status !== 'cliente') {
    throw new Error("Escrita recusada: tirar do estoque (ativo=false) exige status 'vendido' ou 'baixado'.");
  }

  if (status === 'cliente' && patch.ativo !== false) {
    throw new Error("Escrita recusada: aparelho de cliente (status 'cliente') exige ativo=false.");
  }

  if ((status === 'vendido' || status === 'baixado') && patch.ativo !== false) {
    throw new Error(`Escrita recusada: status '${status}' exige ativo=false.`);
  }

  const motivo = patch.motivo_saida as string | null | undefined;
  if (motivo !== undefined && motivo !== null && !(MOTIVOS_SAIDA as readonly string[]).includes(motivo)) {
    throw new Error(`Escrita recusada: motivo_saida '${motivo}' desconhecido.`);
  }
}

/** Patch padronizado para tirar aparelhos do estoque. */
export function patchSaida(
  status: 'vendido' | 'baixado',
  motivo: MotivoSaida,
  quando: Date = new Date()
): PatchCiclo {
  return {
    ativo: false,
    status,
    data_saida: quando.toISOString(),
    motivo_saida: motivo,
  };
}

/** Patch padronizado para devolver aparelhos ao estoque. Não toca em `condicao`. */
export function patchRestauracao(): PatchCiclo {
  return {
    ativo: true,
    status: 'disponivel',
    data_saida: null,
    motivo_saida: null,
  };
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LinhaMovimentacao {
  loja_id: string;
  aparelho_id: string | null;
  tipo: TipoMovimentacao;
  origem: OrigemMovimentacao;
  lote_id: string;
  usuario_id: string | null;
  usuario_nome: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_novo: Record<string, unknown> | null;
  observacao: string | null;
}

/**
 * Monta as linhas de `movimentacoes_estoque` para uma mudança já aplicada.
 *
 * `valor_anterior` guarda os campos auditados como estavam; `valor_novo`, como
 * ficaram. Linhas sem loja identificável são omitidas porque `loja_id` é NOT NULL
 * — quem chama deve tratar essa diferença como auditoria incompleta.
 */
export function montarMovimentacoes(params: {
  antes: EstadoCicloAparelho[];
  patch: Record<string, unknown>;
  tipo: TipoMovimentacao;
  origem: OrigemMovimentacao;
  loteId: string;
  campos: readonly string[];
  lojaIdPadrao?: string | null;
  usuarioId?: string | null;
  usuarioNome?: string | null;
  observacao?: string | null;
}): LinhaMovimentacao[] {
  const usuarioId = params.usuarioId && REGEX_UUID.test(params.usuarioId) ? params.usuarioId : null;

  return params.antes.flatMap((linha) => {
    const lojaId = (linha.loja_id as string | null | undefined) || params.lojaIdPadrao || null;
    if (!lojaId) return [];

    const anterior: Record<string, unknown> = {};
    const novo: Record<string, unknown> = {};

    for (const campo of params.campos) {
      const temNoAntes = Object.prototype.hasOwnProperty.call(linha, campo);
      const temNoPatch = Object.prototype.hasOwnProperty.call(params.patch, campo);
      if (!temNoAntes && !temNoPatch) continue;

      const valorAntes = temNoAntes ? (linha[campo] ?? null) : null;
      anterior[campo] = valorAntes;
      novo[campo] = temNoPatch ? (params.patch[campo] ?? null) : valorAntes;
    }

    return [
      {
        loja_id: lojaId,
        aparelho_id: (linha.id as string | undefined) || null,
        tipo: params.tipo,
        origem: params.origem,
        lote_id: params.loteId,
        usuario_id: usuarioId,
        usuario_nome: params.usuarioNome || null,
        valor_anterior: anterior,
        valor_novo: novo,
        observacao: params.observacao || null,
      },
    ];
  });
}
