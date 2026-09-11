/**
 * Dados do recibo público (/recibo/[id]).
 *
 * O link do recibo vai para o cliente no WhatsApp e no QR code impresso: quem
 * tiver o link vê a página sem login. A API devolvia a venda inteira (custo e
 * lucro da loja), a loja inteira (token do Mercado Pago, dados fiscais,
 * configurações) e o cadastro inteiro do cliente, e ainda aceitava os 6 últimos
 * caracteres do id, o que dava para adivinhar. Aqui fica só o que o recibo
 * mostra: nome, CPF, telefone e e-mail do cliente (o comprovante precisa deles),
 * sem endereço e sem o resto do cadastro.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o id completo abre o recibo: o sufixo de 6 caracteres podia ser adivinhado. */
export function idReciboValido(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID.test(id);
}

/** Colunas de `lojas` que aparecem no recibo. Chave Pix é pública (o cliente paga nela). */
export const CAMPOS_LOJA_RECIBO = [
  'id',
  'nome',
  'subtitulo',
  'logo_url',
  'assinatura_url',
  'endereco',
  'telefone',
  'cnpj',
  'email',
  'garantia_dias',
  'dias_garantia',
  'chave_pix',
  'pix',
] as const;

const CAMPOS_VENDA_RECIBO = [
  'id',
  'clienteNome',
  'vendedor',
  'tipoEntrega',
  'valor',
  'valorTotal',
  'dataPagamento',
  'dataVencimento',
  'status',
  'metodo',
  'formaPagamento',
  'descricao',
  'garantia',
  'descontoTotal',
  'pagamentos',
  'saldoDevedor',
  'valorPago',
] as const;

const CAMPOS_ITEM_RECIBO = [
  'id',
  'descricao',
  'quantidade',
  'valorExibir',
  'valor',
  'total',
  'desconto',
  'tipoDesconto',
  'observacao',
  'imei',
  'codigo',
] as const;

type Registro = Record<string, unknown>;

function escolher(origem: Registro | null | undefined, campos: readonly string[]): Registro {
  const saida: Registro = {};
  if (!origem) return saida;
  for (const campo of campos) {
    if (origem[campo] !== undefined) saida[campo] = origem[campo];
  }
  return saida;
}

const digitos = (valor: unknown) => String(valor ?? '').replace(/\D/g, '');

export function mascararCpf(valor: unknown): string {
  const d = digitos(valor);
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `**.***.***/${d.slice(8, 12)}-${d.slice(12)}`;
  return '';
}

export function mascararTelefone(valor: unknown): string {
  const d = digitos(valor).replace(/^55(?=\d{10,11}$)/, '');
  if (d.length < 8 || /^0+$/.test(d)) return '';
  const ddd = d.length >= 10 ? `(${d.slice(0, 2)}) ` : '';
  return `${ddd}*****-${d.slice(-4)}`;
}

export function mascararEmail(valor: unknown): string {
  const email = String(valor ?? '').trim();
  const [usuario, dominio] = email.split('@');
  if (!usuario || !dominio || email === 'sem@email.com') return '';
  return `${usuario.charAt(0)}***@${dominio}`;
}

export interface ReciboPublico {
  venda: Registro;
  loja: Registro | null;
  cliente: Registro | null;
}

export function montarReciboPublico(
  venda: Registro,
  loja: Registro | null | undefined,
  cliente: Registro | null | undefined
): ReciboPublico {
  const itens = Array.isArray(venda.itens) ? (venda.itens as Registro[]) : [];
  return {
    venda: {
      ...escolher(venda, CAMPOS_VENDA_RECIBO),
      itens: itens.map((item) => escolher(item, CAMPOS_ITEM_RECIBO)),
    },
    loja: loja ? escolher(loja, CAMPOS_LOJA_RECIBO) : null,
    cliente: cliente
      ? {
          nome: cliente.nome ?? null,
          cpf: cliente.cpf ?? null,
          telefone: cliente.telefone ?? null,
          email: cliente.email && cliente.email !== 'sem@email.com' ? cliente.email : null,
        }
      : null,
  };
}
