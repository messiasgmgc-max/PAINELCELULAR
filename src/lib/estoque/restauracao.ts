import { EstadoCicloAparelho, ehEstadoAmbiguoLegado } from './ciclo';

/**
 * Seleção de aparelhos que podem voltar ao estoque numa restauração em massa.
 *
 * A versão anterior reativava TODOS os aparelhos da loja — vendidos inclusive —
 * e ainda sobrescrevia a condição de todos para 'seminovo'. Aqui só entra quem
 * saiu do estoque sem ter sido vendido, e três grupos ficam de fora, contados
 * para a tela explicar por quê.
 */
export interface SelecaoRestauracao<T extends EstadoCicloAparelho> {
  restaurar: T[];
  /** status='vendido': venda concluída nunca é desfeita por restauração em massa. */
  ignoradosVendidos: T[];
  /**
   * Assinatura das remontagens com defeito (condicao='vendido' + status='disponivel').
   * Não dá para saber se cada um foi baixado por engano ou vendido de fato:
   * só a conferência física resolve.
   */
  ignoradosAmbiguos: T[];
  /** Em manutenção: continuam sob custódia do técnico. */
  ignoradosManutencao: T[];
}

export function selecionarCandidatosRestauracao<T extends EstadoCicloAparelho>(
  aparelhos: T[]
): SelecaoRestauracao<T> {
  const selecao: SelecaoRestauracao<T> = {
    restaurar: [],
    ignoradosVendidos: [],
    ignoradosAmbiguos: [],
    ignoradosManutencao: [],
  };

  for (const a of aparelhos) {
    if (a.ativo !== false) continue;

    if (a.status === 'vendido') {
      selecao.ignoradosVendidos.push(a);
    } else if (a.status === 'manutencao') {
      selecao.ignoradosManutencao.push(a);
    } else if (ehEstadoAmbiguoLegado(a)) {
      selecao.ignoradosAmbiguos.push(a);
    } else {
      selecao.restaurar.push(a);
    }
  }

  return selecao;
}
