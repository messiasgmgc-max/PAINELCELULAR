export interface MaquininhaTaxaPerfil {
  id?: string;
  nome?: string;
  porcentagem: number;
  ativo?: boolean;
}

export interface ResultadoCalculoTaxa {
  perfil: MaquininhaTaxaPerfil;
  parcelasSugeridas: number;
  totalComTaxa: number;
  valorParcela: number;
  diferenca: number;
}

export function calcularPerfilMaisProximo(
  valorTotal: number,
  valorParcelaDesejado: number,
  parcelas: number,
  perfis: MaquininhaTaxaPerfil[]
): ResultadoCalculoTaxa | null {
  const valorNumerico = Number(valorTotal) || 0;
  const valorParcelaNumerico = Number(valorParcelaDesejado) || 0;
  const parcelasNumericas = Math.max(1, Number(parcelas) || 1);

  if (!perfis.length || valorNumerico <= 0) {
    return null;
  }

  const parcelasSugeridas = valorParcelaNumerico > 0
    ? Math.max(1, Math.round(valorNumerico / valorParcelaNumerico))
    : parcelasNumericas;

  const resultados = perfis
    .map((perfil) => {
      const taxa = Number(perfil.porcentagem) || 0;
      const totalComTaxa = valorNumerico * (1 + taxa / 100);
      const valorParcela = totalComTaxa / parcelasSugeridas;
      const diferenca = Math.abs(valorParcela - valorParcelaNumerico);

      return {
        perfil,
        parcelasSugeridas,
        totalComTaxa,
        valorParcela,
        diferenca,
      };
    })
    .sort((a, b) => a.diferenca - b.diferenca);

  return resultados[0] ?? null;
}
