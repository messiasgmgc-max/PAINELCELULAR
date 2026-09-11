/**
 * Cancelamento da assinatura pelo painel.
 *
 * A página /assinar promete "cancelar direto pelo seu painel, sem fidelidade",
 * mas não existia botão nem rota. A cobrança é por período (Pix ou cartão, sem
 * débito recorrente): cancelar quer dizer não renovar. A loja segue liberada
 * até o vencimento já pago e depois bloqueia como qualquer plano vencido.
 *
 * O estado fica em lojas.configuracoes.assinatura, sem mudança de schema.
 */

export type AcaoAssinatura = 'cancelar' | 'reativar';

export interface EstadoAssinatura {
  cancelada: boolean;
  canceladaEm: string | null;
  motivo: string | null;
  canceladaPor: string | null;
  /** Último dia de acesso já pago no momento do cancelamento (AAAA-MM-DD). */
  acessoAte: string | null;
}

export const MOTIVOS_CANCELAMENTO = [
  'Preço alto',
  'Faltou uma função',
  'Vou usar outro sistema',
  'Fechei ou vou fechar a loja',
  'Outro motivo',
] as const;

const ASSINATURA_ATIVA: EstadoAssinatura = {
  cancelada: false,
  canceladaEm: null,
  motivo: null,
  canceladaPor: null,
  acessoAte: null,
};

type Objeto = Record<string, unknown>;

const comoObjeto = (valor: unknown): Objeto =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? { ...(valor as Objeto) } : {};

const texto = (valor: unknown): string | null => (typeof valor === 'string' && valor.trim() ? valor : null);

const soData = (valor: unknown): string | null => {
  const t = texto(valor);
  const data = t ? t.split('T')[0] : null;
  return data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
};

export function lerAssinatura(configuracoes: unknown, dataVencimento: string | null | undefined): EstadoAssinatura {
  const assinatura = comoObjeto(comoObjeto(configuracoes).assinatura);
  if (assinatura.renovacao !== 'cancelada') return ASSINATURA_ATIVA;

  const acessoAte = soData(assinatura.acesso_ate);
  const vencimento = soData(dataVencimento);
  // Pagou de novo depois de cancelar: o vencimento passou do acesso combinado,
  // então a assinatura voltou a valer sem a pessoa precisar desfazer nada.
  if (acessoAte && vencimento && vencimento > acessoAte) return ASSINATURA_ATIVA;

  return {
    cancelada: true,
    canceladaEm: texto(assinatura.cancelada_em),
    motivo: texto(assinatura.motivo),
    canceladaPor: texto(assinatura.cancelada_por),
    acessoAte,
  };
}

export function registrarCancelamento(
  configuracoes: unknown,
  params: { motivo?: string | null; por: string; agora: Date; dataVencimento: string | null | undefined }
): Objeto {
  return {
    ...comoObjeto(configuracoes),
    assinatura: {
      renovacao: 'cancelada',
      cancelada_em: params.agora.toISOString(),
      motivo: params.motivo?.trim().slice(0, 500) || null,
      cancelada_por: params.por,
      acesso_ate: soData(params.dataVencimento),
    },
  };
}

export function registrarReativacao(configuracoes: unknown, params: { por: string; agora: Date }): Objeto {
  return {
    ...comoObjeto(configuracoes),
    assinatura: {
      renovacao: 'ativa',
      reativada_em: params.agora.toISOString(),
      reativada_por: params.por,
    },
  };
}

/** Só quem responde pela loja cancela: vendedor e operador não. */
export function podeGerenciarAssinatura(role: unknown): boolean {
  const papel = String(role || '').toLowerCase();
  return papel === 'admin' || papel === 'gerente' || papel === 'super_admin';
}
