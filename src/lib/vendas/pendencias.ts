import { Aparelho, Cliente } from '@/lib/db/types';
import { extrairAparelhoEImeiDaVenda } from '@/lib/utils';

export const PADRAO_NOME_GENERICO =
  /^(comum|cliente comum|consumidor|cliente consumidor|final|cliente final|balc[aã]o|cliente balc[aã]o|pendente|n[aã]o informado|sem nome|desconhecido|an[oô]nimo)$/i;

export interface DiagnosticoVendaPendente {
  isPendente: boolean;
  motivosObrigatorios: string[];
  camposComplementares: string[];
  clienteVinculado: Cliente | null;
}

export function ehNomeClienteGenerico(nome?: string | null): boolean {
  const limpo = (nome || '').trim();
  if (!limpo) return true;
  return PADRAO_NOME_GENERICO.test(limpo) || /(comum|balc[aã]o|pendente|consumidor)/i.test(limpo);
}

export function telefoneClienteValido(telefone?: string | null): boolean {
  const digitos = (telefone || '').replace(/\D/g, '');
  if (digitos.length < 8) return false;
  if (/^0+$/.test(digitos)) return false;
  return true;
}

export function isVendaAtacado(venda: any): boolean {
  if (!venda) return false;
  const tipoEntrega = String(venda.tipoEntrega || '').toLowerCase();
  const desc = String(venda.descricao || '').toLowerCase();
  const canal = String(venda.canal || venda.tipo_venda || venda.tipoVenda || '').toLowerCase();
  return tipoEntrega.includes('atacado') || desc.includes('atacado') || canal.includes('atacado');
}

export interface DadosParaDiagnostico {
  nome?: string | null;
  clienteId?: string | null;
  clienteEncontrado?: Cliente | null;
  clientesCarregados?: boolean;
  telefone?: string | null;
  email?: string | null;
  cpf?: string | null;
  imei?: string | null;
  custo?: number | null;
  dadosClientePendente?: boolean;
  isAtacado?: boolean;
}

/**
 * Avalia os campos obrigatórios e complementares de uma venda/notinha.
 * Compartilhado entre a listagem de vendas e o modal de edição/completar notinha.
 */
export function avaliarPendenciasNotinha(dados: DadosParaDiagnostico): DiagnosticoVendaPendente {
  const motivosObrigatorios: string[] = [];
  const camposComplementares: string[] = [];
  const cli = dados.clienteEncontrado || null;

  if (!dados.isAtacado) {
    const nomeVendaGenerico = ehNomeClienteGenerico(dados.nome);
    const nomeClienteGenerico = cli ? ehNomeClienteGenerico(cli.nome) : false;

    if (nomeVendaGenerico || nomeClienteGenerico) {
      motivosObrigatorios.push('Nome do cliente');
    }

    if (!cli && !dados.clienteId) {
      motivosObrigatorios.push('Cadastro do cliente');
    }

    const telefoneEfetivo = dados.telefone ?? cli?.telefone ?? '';
    const deveValidarTelefone = Boolean(cli) || !dados.clienteId || Boolean(dados.clientesCarregados);
    if (deveValidarTelefone && !telefoneClienteValido(telefoneEfetivo)) {
      motivosObrigatorios.push('Telefone / WhatsApp');
    }

    if (dados.dadosClientePendente === true && motivosObrigatorios.length === 0) {
      motivosObrigatorios.push('Confirmação dos dados');
    }
  }

  const emailEfetivo = (dados.email ?? cli?.email ?? '').trim();
  if (!emailEfetivo || emailEfetivo.toLowerCase() === 'sem@email.com') {
    camposComplementares.push('E-mail');
  }

  const cpfEfetivo = (dados.cpf ?? cli?.cpf ?? '').trim();
  if (!cpfEfetivo) {
    camposComplementares.push('CPF / CNPJ');
  }

  if (!dados.imei || !String(dados.imei).trim()) {
    camposComplementares.push('IMEI');
  }

  if (!dados.custo || Number(dados.custo) <= 0) {
    camposComplementares.push('Custo');
  }

  return {
    isPendente: !dados.isAtacado && motivosObrigatorios.length > 0,
    motivosObrigatorios,
    camposComplementares,
    clienteVinculado: cli,
  };
}

/**
 * Diagnóstico completo de pendências de uma venda existente no painel.
 */
export function diagnosticarVendaPendente(
  venda: any,
  listaClientes?: Cliente[],
  listaAparelhos?: Aparelho[]
): DiagnosticoVendaPendente {
  const nome = (venda?.clienteNome || '').trim();
  const clientesDisponiveis = Array.isArray(listaClientes) ? listaClientes : [];

  let clienteVinculado: Cliente | null = null;
  if (clientesDisponiveis.length > 0) {
    if (venda?.clienteId) {
      clienteVinculado = clientesDisponiveis.find((c) => c.id === venda.clienteId) || null;
    }
    if (!clienteVinculado && nome && !ehNomeClienteGenerico(nome)) {
      const nomeLower = nome.toLowerCase();
      clienteVinculado =
        clientesDisponiveis.find((c) => (c.nome || '').trim().toLowerCase() === nomeLower) || null;
    }
  }

  const apInfo = extrairAparelhoEImeiDaVenda(venda || {}, listaAparelhos || []);

  const telefoneVenda =
    clienteVinculado?.telefone ??
    (venda as any)?.clienteTelefone ??
    (venda as any)?.telefone ??
    '';

  const emailVenda =
    clienteVinculado?.email ??
    (venda as any)?.clienteEmail ??
    (venda as any)?.email ??
    '';

  const cpfVenda =
    clienteVinculado?.cpf ??
    (venda as any)?.clienteCpf ??
    (venda as any)?.cpf ??
    '';

  return avaliarPendenciasNotinha({
    nome,
    clienteId: venda?.clienteId || null,
    clienteEncontrado: clienteVinculado,
    clientesCarregados: clientesDisponiveis.length > 0,
    telefone: telefoneVenda,
    email: emailVenda,
    cpf: cpfVenda,
    imei: apInfo.imei || '',
    custo: Number(venda?.custo || 0),
    dadosClientePendente: Boolean(venda?.dados_cliente_pendente),
    isAtacado: isVendaAtacado(venda),
  });
}
