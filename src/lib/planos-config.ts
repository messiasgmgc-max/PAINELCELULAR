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
  recursos: RecursoPlano[];
}

export const WHATSAPP_SUPORTE = '5531993586377';
export const WHATSAPP_SUPORTE_URL = 'https://wa.me/5531993586377?text=' + encodeURIComponent('Olá! Gostaria de tirar dúvidas sobre os planos do Phone Center.');

export const PLANOS_SISTEMA: Record<TipoPlano, PlanoConfig> = {
  entrada: {
    id: 'entrada',
    nome: 'Entrada',
    badge: 'Mais Acessível',
    descricao: 'Ideal para lojas individuais e assistências que querem profissionalizar suas vendas e estoque com o bot mais ágil do mercado.',
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
      'Site e Painel Web Completo de Gestão',
      'Bot WhatsApp Ágil (!estoque, !vender, !cadastrar, !os)',
      'Leitura inteligente de etiquetas por OCR (Gemini Vision)',
      'Respostas em Linguagem Natural com IA integrada',
      'Controle de Garantias e Ordens de Serviço',
      'Cadastro de Compradores e Recibos Térmicos',
      '1 Conexão WhatsApp Dedicada'
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
    descricao: 'Para lojistas em crescimento que trabalham com atacado, crediário próprio e necessitam de velocidade de checagem e vendas.',
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
      'Tudo incluído no Plano Entrada',
      'Gestão Automatizada de Fiado e Saldo Devedor (!abater, !saldo)',
      'Checagem rápida de IMEI e Bloqueios Anatel/Operadoras (!checarimei)',
      'Disparo e Broadcast de Lista de Estoque em Grupos (!broadcast)',
      'Histórico completo de transações e recibos de abatimento',
      'Suporte humanizado no WhatsApp'
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
    descricao: 'A suíte definitiva para grandes lojas, revendedores com equipes e redes de parceiros que exigem escala e integração total.',
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
      'Tudo incluído no Plano Intermediário',
      'Escuta Inteligente e Busca em Grupos Multi-Loja (Rede de Parceiros)',
      'Trilha de Auditoria Completa com logs de alterações e aprovações',
      'API REST com API Key para integrar sistemas e bots próprios',
      'Gestão multi-usuários com controle granular de permissões',
      'Fila de Suporte VIP Prioritário 24/7'
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
