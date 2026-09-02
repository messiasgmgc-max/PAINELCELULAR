import { getModeloOrdemCronologica, sortModelosCronologico } from './utils';

export interface RespostaCondicaoUpgrade {
  bateriaPercentual: number; // ex: 85
  estadoTela: 'original_impecavel' | 'riscos_leves' | 'trocada_compativel' | 'trincada_quebrada';
  estadoCarcaca: 'impecavel' | 'marcas_leves' | 'amassados_arranhaos' | 'trincada_quebrada';
  faceIdFunciona: boolean;
  camerasFuncionam: boolean;
  temCaixaAcessorios: boolean;
  conectorCarregadorOk: boolean;
}

export interface DeducaoAvaliacao {
  motivo: string;
  valor: number;
  tipo: 'fixo' | 'percentual';
}

export interface ResultadoAvaliacaoUpgrade {
  modelo: string;
  capacidade: string;
  valorBase: number;
  deducoes: DeducaoAvaliacao[];
  totalDeducoes: number;
  valorFinal: number;
  valorRevendaEstimado: number;
  lucroEstimadoLoja: number;
}

// ── 1. Tabela Base de Valores de Recompra (Trade-In) Padrão ──
// Valores de balcão calibrados para compra de aparelhos usados em boas condições
export const TABELA_BASE_UPGRADE_PADRAO: Record<string, Record<string, number>> = {
  'iPhone 7': { '32GB': 250, '128GB': 320, '256GB': 380 },
  'iPhone 7 Plus': { '32GB': 350, '128GB': 450, '256GB': 500 },
  'iPhone 8': { '64GB': 400, '128GB': 480, '256GB': 550 },
  'iPhone 8 Plus': { '64GB': 550, '128GB': 650, '256GB': 720 },
  'iPhone X': { '64GB': 650, '256GB': 800 },
  'iPhone XR': { '64GB': 800, '128GB': 950, '256GB': 1100 },
  'iPhone XS': { '64GB': 850, '256GB': 1050, '512GB': 1200 },
  'iPhone XS Max': { '64GB': 1050, '256GB': 1250, '512GB': 1400 },
  'iPhone SE (2ª Geração)': { '64GB': 600, '128GB': 750, '256GB': 900 },
  'iPhone SE (3ª Geração)': { '64GB': 950, '128GB': 1150, '256GB': 1350 },
  'iPhone 11': { '64GB': 1150, '128GB': 1350, '256GB': 1550 },
  'iPhone 11 Pro': { '64GB': 1400, '256GB': 1650, '512GB': 1850 },
  'iPhone 11 Pro Max': { '64GB': 1650, '256GB': 1950, '512GB': 2150 },
  'iPhone 12 Mini': { '64GB': 1300, '128GB': 1500, '256GB': 1700 },
  'iPhone 12': { '64GB': 1550, '128GB': 1800, '256GB': 2050 },
  'iPhone 12 Pro': { '128GB': 2100, '256GB': 2350, '512GB': 2600 },
  'iPhone 12 Pro Max': { '128GB': 2500, '256GB': 2800, '512GB': 3100 },
  'iPhone 13 Mini': { '128GB': 1950, '256GB': 2250, '512GB': 2550 },
  'iPhone 13': { '128GB': 2300, '256GB': 2600, '512GB': 2950 },
  'iPhone 13 Pro': { '128GB': 2950, '256GB': 3300, '512GB': 3650, '1TB': 4000 },
  'iPhone 13 Pro Max': { '128GB': 3450, '256GB': 3800, '512GB': 4200, '1TB': 4550 },
  'iPhone 14': { '128GB': 2900, '256GB': 3250, '512GB': 3650 },
  'iPhone 14 Plus': { '128GB': 3150, '256GB': 3500, '512GB': 3900 },
  'iPhone 14 Pro': { '128GB': 3800, '256GB': 4200, '512GB': 4600, '1TB': 5000 },
  'iPhone 14 Pro Max': { '128GB': 4300, '256GB': 4750, '512GB': 5200, '1TB': 5650 },
  'iPhone 15': { '128GB': 3700, '256GB': 4150, '512GB': 4650 },
  'iPhone 15 Plus': { '128GB': 4100, '256GB': 4550, '512GB': 5050 },
  'iPhone 15 Pro': { '128GB': 4750, '256GB': 5250, '512GB': 5800, '1TB': 6350 },
  'iPhone 15 Pro Max': { '256GB': 5600, '512GB': 6200, '1TB': 6850 },
  'iPhone 16': { '128GB': 4700, '256GB': 5300, '512GB': 5950 },
  'iPhone 16 Plus': { '128GB': 5200, '256GB': 5800, '512GB': 6450 },
  'iPhone 16 Pro': { '128GB': 5900, '256GB': 6600, '512GB': 7350, '1TB': 8100 },
  'iPhone 16 Pro Max': { '256GB': 6950, '512GB': 7750, '1TB': 8600 },
};

// Modelos suportados ordenados cronologicamente do mais ANTIGO ao mais NOVO
export const MODELOS_UPGRADE_DISPONIVEIS = Object.keys(TABELA_BASE_UPGRADE_PADRAO).sort((a, b) =>
  sortModelosCronologico(a, b, 'antigo_para_novo')
);

// ── 2. Regras Padrão de Dedução por Estado de Conservação ──
export const REGRAS_DEDUCAO_PADRAO = {
  // Bateria
  bateriaOtima: 0, // 85% a 100%
  bateriaModeradaPercentual: 5, // 80% a 84% (-5%)
  bateriaGastaValor: 180, // < 80% (custo de reposição)

  // Tela
  telaImpecavel: 0,
  telaRiscosLevesPercentual: 6, // -6%
  telaTrocadaCompativelValor: 220, // Tela trocada não original
  telaTrincadaQuebradaValor: 450, // Custo de display novo

  // Carcaça / Traseira
  carcacaImpecavel: 0,
  carcacaMarcasLevesPercentual: 4, // -4%
  carcacaAmassadosPercentual: 10, // -10%
  carcacaTraseiraQuebradaValor: 250, // Custo troca vidro traseiro

  // Componentes Funcionais
  faceIdDefeituosoPercentual: 25, // Desvaloriza 25%
  camerasDefeituosasValor: 300, // Custo reparo câmera
  conectorComDefeitoValor: 120, // Reparo dock

  // Bônus
  bonusCaixaAcessoriosValor: 50, // +R$ 50 se tiver caixa completa
};

/**
 * Calcula a avaliação precisa do aparelho usado considerando o modelo, capacidade
 * e todas as respostas de diagnóstico do cliente ou lojista.
 */
export function calcularAvaliacaoUpgrade(
  modelo: string,
  capacidade: string,
  condicoes: RespostaCondicaoUpgrade,
  tabelaCustom?: Record<string, Record<string, number>>,
  regrasCustom?: Partial<typeof REGRAS_DEDUCAO_PADRAO>
): ResultadoAvaliacaoUpgrade {
  const tabela = tabelaCustom && Object.keys(tabelaCustom).length > 0
    ? { ...TABELA_BASE_UPGRADE_PADRAO, ...tabelaCustom }
    : TABELA_BASE_UPGRADE_PADRAO;

  const regras = { ...REGRAS_DEDUCAO_PADRAO, ...(regrasCustom || {}) };

  // Busca valor base do modelo + capacidade
  const precosModelo = tabela[modelo] || {};
  let valorBase = precosModelo[capacidade];

  // Se não achar capacidade exata, tenta a menor capacidade ou fallback
  if (!valorBase || valorBase <= 0) {
    const capacidadesDisponiveis = Object.keys(precosModelo);
    if (capacidadesDisponiveis.length > 0) {
      valorBase = precosModelo[capacidadesDisponiveis[0]] || 800;
    } else {
      valorBase = 800;
    }
  }

  const deducoes: DeducaoAvaliacao[] = [];

  // 1. Saúde da Bateria
  const bat = Number(condicoes.bateriaPercentual) || 85;
  if (bat < 80) {
    deducoes.push({
      motivo: `Saúde da bateria baixa (${bat}% - requer troca)`,
      valor: regras.bateriaGastaValor,
      tipo: 'fixo'
    });
  } else if (bat < 85) {
    const desconto = Math.round((valorBase * regras.bateriaModeradaPercentual) / 100);
    deducoes.push({
      motivo: `Saúde da bateria intermediária (${bat}%)`,
      valor: desconto,
      tipo: 'percentual'
    });
  }

  // 2. Estado da Tela
  if (condicoes.estadoTela === 'trincada_quebrada') {
    deducoes.push({
      motivo: 'Tela trincada ou com avaria no display',
      valor: regras.telaTrincadaQuebradaValor,
      tipo: 'fixo'
    });
  } else if (condicoes.estadoTela === 'trocada_compativel') {
    deducoes.push({
      motivo: 'Tela já substituída (não genuína)',
      valor: regras.telaTrocadaCompativelValor,
      tipo: 'fixo'
    });
  } else if (condicoes.estadoTela === 'riscos_leves') {
    const desc = Math.round((valorBase * regras.telaRiscosLevesPercentual) / 100);
    deducoes.push({
      motivo: 'Riscos superficiais na tela',
      valor: desc,
      tipo: 'percentual'
    });
  }

  // 3. Estado da Carcaça
  if (condicoes.estadoCarcaca === 'trincada_quebrada') {
    deducoes.push({
      motivo: 'Vidro traseiro quebrado ou carcaça trincada',
      valor: regras.carcacaTraseiraQuebradaValor,
      tipo: 'fixo'
    });
  } else if (condicoes.estadoCarcaca === 'amassados_arranhaos') {
    const desc = Math.round((valorBase * regras.carcacaAmassadosPercentual) / 100);
    deducoes.push({
      motivo: 'Marcas de queda / amassados na carcaça',
      valor: desc,
      tipo: 'percentual'
    });
  } else if (condicoes.estadoCarcaca === 'marcas_leves') {
    const desc = Math.round((valorBase * regras.carcacaMarcasLevesPercentual) / 100);
    deducoes.push({
      motivo: 'Marcas normais de uso no aro/carcaça',
      valor: desc,
      tipo: 'percentual'
    });
  }

  // 4. Face ID / Touch ID
  if (!condicoes.faceIdFunciona) {
    const desc = Math.round((valorBase * regras.faceIdDefeituosoPercentual) / 100);
    deducoes.push({
      motivo: 'Biometria / Face ID inoperante',
      valor: desc,
      tipo: 'percentual'
    });
  }

  // 5. Câmeras
  if (!condicoes.camerasFuncionam) {
    deducoes.push({
      motivo: 'Falha ou mancha nas câmeras',
      valor: regras.camerasDefeituosasValor,
      tipo: 'fixo'
    });
  }

  // 6. Conector de Carga
  if (!condicoes.conectorCarregadorOk) {
    deducoes.push({
      motivo: 'Mau contato na entrada de carregador',
      valor: regras.conectorComDefeitoValor,
      tipo: 'fixo'
    });
  }

  // 7. Bônus por Caixa e Acessórios
  if (condicoes.temCaixaAcessorios && regras.bonusCaixaAcessoriosValor > 0) {
    deducoes.push({
      motivo: 'Bônus: Caixa original e acessórios inclusos',
      valor: -regras.bonusCaixaAcessoriosValor, // Negativo reduz a dedução, aumentando o valor final
      tipo: 'fixo'
    });
  }

  const totalDeducoes = deducoes.reduce((acc, d) => acc + d.valor, 0);

  // Garante que o valor final nunca seja menor que 10% do valor base nem negativo
  const pisoMinimo = Math.round(valorBase * 0.15);
  const valorFinalCalculado = Math.max(pisoMinimo, Math.round(valorBase - totalDeducoes));

  // Estimativa de revenda da loja (margem padrão média de ~25% a 30%)
  const valorRevendaEstimado = Math.round(valorFinalCalculado * 1.30);
  const lucroEstimadoLoja = valorRevendaEstimado - valorFinalCalculado;

  return {
    modelo,
    capacidade,
    valorBase,
    deducoes,
    totalDeducoes,
    valorFinal: valorFinalCalculado,
    valorRevendaEstimado,
    lucroEstimadoLoja,
  };
}

/**
 * Gera um protocolo amigável e único para a avaliação (ex: #UPG-8314)
 */
export function gerarProtocoloUpgrade(): string {
  const aleatorio = Math.floor(1000 + Math.random() * 9000);
  return `#UPG-${aleatorio}`;
}
