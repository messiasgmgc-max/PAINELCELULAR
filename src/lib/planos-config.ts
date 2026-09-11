// Definição Oficial de Planos, Recursos e Precificação do Phone Center
export type TipoPlano = 'entrada' | 'intermediario' | 'avancado';
export type PeriodoFaturamento = 'mensal' | 'trimestral' | 'anual';

export type RecursoPlano = 
  | 'painel_web'
  | 'bot_basico'
  | 'vendas'
  | 'estoque'
  | 'os'
  | 'ocr_gemini'
  | 'ia_natural'
  | 'fiado_devedores'
  | 'consulta_imei'
  | 'broadcast_grupos'
  | 'escuta_multiloja'
  | 'auditoria_avancada'
  | 'api_key_acesso'
  | 'suporte_vip';

export interface PlanoConfig {
  id: TipoPlano;
  nome: string;
  badge?: string;
  descricao: string;
  popular?: boolean;
  precos: {
    mensal: {
      valorMensal: number;
      valorTotal: number;
      diasValidade: number;
      descontoPercentual: number;
    };
    trimestral: {
      valorMensal: number;
      valorTotal: number;
      diasValidade: number;
      descontoPercentual: number;
    };
    anual: {
      valorMensal: number;
      valorTotal: number;
      diasValidade: number;
      descontoPercentual: number;
    };
  };
  beneficios: string[];
  /** O que o plano NÃO libera (dito com todas as letras, para ninguém assinar achando que tem). */
  naoInclui?: string[];
  recursos: RecursoPlano[];
}

export const WHATSAPP_SUPORTE = '5531993586377';
export const WHATSAPP_SUPORTE_URL = 'https://wa.me/5531993586377?text=' + encodeURIComponent('Olá! Gostaria de tirar dúvidas sobre os planos do Phone Center.');

/** Dias do teste grátis: cadastro pela /assinar e teste de outro plano no painel. */
export const DIAS_TESTE_GRATIS = 7;
export const TEXTO_TESTE_GRATIS = `${DIAS_TESTE_GRATIS} dias grátis`;
/** Valor gravado em historico_pagamentos_planos.metodo_pagamento quando o teste é concedido. */
export const METODO_PAGAMENTO_TESTE = `trial_${DIAS_TESTE_GRATIS}_dias`;

/** Fim do teste grátis a partir de `inicio`. */
export function fimDoTesteGratis(inicio: Date = new Date(), dias: number = DIAS_TESTE_GRATIS): Date {
  return new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000);
}

/** Registro do histórico que foi um teste grátis (os antigos são "trial_3_dias"). */
export function ehRegistroDeTesteGratis(pagamento: { metodo_pagamento?: string | null; forma_pagamento?: string | null }): boolean {
  return pagamento.forma_pagamento === 'trial_gratis' || /^trial_\d+_dias$/.test(pagamento.metodo_pagamento || '');
}

export const PLANOS_SISTEMA: Record<TipoPlano, PlanoConfig> = {
  entrada: {
    id: 'entrada',
    nome: 'Entrada',
    badge: 'Mais Acessível',
    descricao: 'Para a loja ou assistência que quer o sistema completo no painel e o bot no WhatsApp para estoque, vendas e OS.',
    popular: false,
    precos: {
      mensal: {
        valorMensal: 99.90,
        valorTotal: 99.90,
        diasValidade: 30,
        descontoPercentual: 0
      },
      trimestral: {
        valorMensal: 89.90,
        valorTotal: 269.70,
        diasValidade: 90,
        descontoPercentual: 10
      },
      anual: {
        valorMensal: 79.90,
        valorTotal: 958.80,
        diasValidade: 365,
        descontoPercentual: 20
      }
    },
    beneficios: [
      'Painel web completo: estoque por IMEI, PDV, OS, atacado com fiado, clientes e garantias',
      'Usuários sem limite e sem cobrança por usuário',
      'Etiquetas dos aparelhos, NFC-e/NF-e (com sua conta Focus NFe) e app no celular',
      'Bot no WhatsApp: consulta de estoque, venda, cadastro e OS (!estoque, !vender, !cadastrar, !os)',
      'Bot entende linguagem natural ("vendi o 13 pro pro Lucas por 2500")',
      'Cadastro por foto da etiqueta (leitura por IA)',
      '1 número de WhatsApp conectado ao bot',
      'Migração do MercadoPhone: estoque, clientes e vendas com prévia'
    ],
    naoInclui: [
      'Bot cobrando fiado e saldo devedor no WhatsApp (!abater, !saldo)',
      'Checagem de IMEI pelo bot (!checarimei)',
      'Disparo de lista de estoque em grupos (!broadcast)',
      'Rede multi-loja, trilha de auditoria e API'
    ],
    recursos: [
      'painel_web',
      'bot_basico',
      'vendas',
      'estoque',
      'os',
      'ocr_gemini',
      'ia_natural'
    ]
  },
  intermediario: {
    id: 'intermediario',
    nome: 'Intermediário',
    badge: 'Mais Popular',
    popular: true,
    descricao: 'Para quem vende no atacado e no fiado e quer o bot cobrando, checando IMEI e divulgando o estoque nos grupos.',
    precos: {
      mensal: {
        valorMensal: 189.00,
        valorTotal: 189.00,
        diasValidade: 30,
        descontoPercentual: 0
      },
      trimestral: {
        valorMensal: 169.00,
        valorTotal: 507.00,
        diasValidade: 90,
        descontoPercentual: 11
      },
      anual: {
        valorMensal: 149.00,
        valorTotal: 1788.00,
        diasValidade: 365,
        descontoPercentual: 21
      }
    },
    beneficios: [
      'Tudo do plano Entrada',
      'Bot cobra e abate fiado e saldo devedor no WhatsApp (!abater, !saldo)',
      'Checagem rápida de IMEI e Bloqueios Anatel/Operadoras (!checarimei)',
      'Disparo da lista de estoque em grupos do WhatsApp (!broadcast)',
      'Recibo de abatimento enviado ao cliente no WhatsApp',
      'Suporte humano no WhatsApp'
    ],
    recursos: [
      'painel_web',
      'bot_basico',
      'vendas',
      'estoque',
      'os',
      'ocr_gemini',
      'ia_natural',
      'fiado_devedores',
      'consulta_imei',
      'broadcast_grupos'
    ]
  },
  avancado: {
    id: 'avancado',
    nome: 'Avançado',
    badge: 'Máxima Potência',
    popular: false,
    descricao: 'Para redes de parceiros e lojas que precisam de auditoria e integração por API.',
    precos: {
      mensal: {
        valorMensal: 299.00,
        valorTotal: 299.00,
        diasValidade: 30,
        descontoPercentual: 0
      },
      trimestral: {
        valorMensal: 269.00,
        valorTotal: 807.00,
        diasValidade: 90,
        descontoPercentual: 10
      },
      anual: {
        valorMensal: 239.00,
        valorTotal: 2868.00,
        diasValidade: 365,
        descontoPercentual: 20
      }
    },
    beneficios: [
      'Tudo do plano Intermediário',
      'Escuta e busca de estoque em grupos multi-loja (rede de parceiros)',
      'Trilha de auditoria com log de alterações e aprovações',
      'Chave de API para integrar sistemas e bots próprios',
      'Suporte prioritário'
    ],
    recursos: [
      'painel_web',
      'bot_basico',
      'vendas',
      'estoque',
      'os',
      'ocr_gemini',
      'ia_natural',
      'fiado_devedores',
      'consulta_imei',
      'broadcast_grupos',
      'escuta_multiloja',
      'auditoria_avancada',
      'api_key_acesso',
      'suporte_vip'
    ]
  }
};

// Obter dados do plano com fallback seguro
export function obterPlanoPorTipo(tipo?: string | null): PlanoConfig {
  const chave = (tipo || '').toLowerCase() as TipoPlano;
  if (chave && PLANOS_SISTEMA[chave]) {
    return PLANOS_SISTEMA[chave];
  }
  return PLANOS_SISTEMA.entrada;
}

// Obter valores de acordo com o plano e a periodicidade
export function calcularValoresPlano(
  tipo: TipoPlano,
  periodo: PeriodoFaturamento = 'mensal'
) {
  const plano = obterPlanoPorTipo(tipo);
  const config = plano.precos[periodo] || plano.precos.mensal;
  return {
    plano: plano.id,
    nomePlano: plano.nome,
    periodo,
    valorMensal: config.valorMensal,
    valorTotal: config.valorTotal,
    diasValidade: config.diasValidade,
    descontoPercentual: config.descontoPercentual
  };
}

// Verificar se um plano tem permissão para acessar um determinado recurso
export function verificarPermissaoRecursoPlano(
  planoTipo?: string | null,
  recurso?: RecursoPlano
): boolean {
  if (!recurso) return true;
  const plano = obterPlanoPorTipo(planoTipo);
  return plano.recursos.includes(recurso);
}

// Obter plano mínimo necessário para um recurso
export function obterPlanoMinimoParaRecurso(recurso: RecursoPlano): TipoPlano {
  if (PLANOS_SISTEMA.entrada.recursos.includes(recurso)) return 'entrada';
  if (PLANOS_SISTEMA.intermediario.recursos.includes(recurso)) return 'intermediario';
  return 'avancado';
}
