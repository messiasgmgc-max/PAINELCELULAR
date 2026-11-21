import { supabaseAdmin } from '@/integrations/supabase/server';
import { filtrarESortearAparelhos } from '@/lib/buscaEstoque';
import {
  calcularAvaliacaoUpgrade,
  MODELOS_UPGRADE_DISPONIVEIS,
  RespostaCondicaoUpgrade,
  ResultadoAvaliacaoUpgrade,
} from '@/lib/upgradeEngine';
import { vendaConta } from '@/lib/vendas/situacao';
import { Aparelho } from '@/lib/db/types';

export interface EstoqueItemBridge {
  id: string;
  codigo: string;
  marca: string;
  modelo: string;
  capacidade: string;
  cor: string;
  condicao: string;
  status?: string;
  reservado?: boolean;
  saudeBateria: string;
  preco: number;
  precoAtacado: number | null;
  quantidade: number;
  categoria: string;
  observacoes: string;
  imeiFinal: string;
}

export interface ParcelaSimulada {
  parcelas: number;
  taxaPercentual: number;
  totalComTaxa: number;
  valorParcela: number;
}

export interface SimulacaoCompletaBridge {
  valorAparelho: number;
  valorTroca: number;
  entradaPix: number;
  saldoFinanciar: number;
  avaliacaoTroca?: ResultadoAvaliacaoUpgrade;
  parcelamento: ParcelaSimulada[];
  textoWhatsapp: string;
}

export interface Cliente360Bridge {
  encontrado: boolean;
  cliente: {
    id: string;
    nome: string;
    telefone: string;
    email: string;
    cpf: string;
    cidade: string;
  } | null;
  compras: Array<{
    id: string;
    aparelhoDescricao: string;
    valor: number;
    dataPagamento: string;
    metodo: string;
    status: string;
  }>;
  garantias: Array<{
    aparelhoModelo: string;
    dataFim: string;
    status: string;
  }>;
  ordensServico: Array<{
    numeroOS: string;
    aparelhoModelo: string;
    defeito: string;
    status: string;
    dataEntrada: string;
  }>;
  resumo: {
    totalCompras: number;
    totalGasto: number;
    garantiasAtivas: number;
    osAbertas: number;
  };
}

export interface RankingVendedorItem {
  vendedor: string;
  quantidade: number;
  faturamento: number;
  ticketMedio: number;
}

export interface RankingVendasBridge {
  periodoDias: number;
  totalVendas: number;
  faturamentoTotal: number;
  ticketMedioGeral: number;
  ranking: RankingVendedorItem[];
  topModelos: Array<{ modelo: string; quantidade: number; faturamento: number }>;
}

const TAXAS_PADRAO_FALLBACK: Array<{ parcelas: number; porcentagem: number }> = [
  { parcelas: 1, porcentagem: 3.49 },
  { parcelas: 2, porcentagem: 4.59 },
  { parcelas: 3, porcentagem: 5.49 },
  { parcelas: 4, porcentagem: 6.39 },
  { parcelas: 5, porcentagem: 7.29 },
  { parcelas: 6, porcentagem: 8.19 },
  { parcelas: 8, porcentagem: 9.89 },
  { parcelas: 10, porcentagem: 11.49 },
  { parcelas: 12, porcentagem: 12.99 },
  { parcelas: 15, porcentagem: 15.99 },
  { parcelas: 18, porcentagem: 18.49 },
];

export function normalizarDigitosTelefone(telefone?: string | null): string {
  if (!telefone) return '';
  return String(telefone).replace(/\D/g, '');
}

export function sufixoTelefoneComparacao(telefone?: string | null): string {
  const digitos = normalizarDigitosTelefone(telefone);
  if (digitos.length <= 8) return digitos;
  return digitos.slice(-8);
}

export function formatarBRL(valor: number): string {
  return (Number(valor) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function aparelhoDisponivel(ap: Record<string, unknown>): boolean {
  const status = String(ap.status || '').toLowerCase();
  const condicao = String(ap.condicao || '').toLowerCase();
  if (ap.ativo === false) return false;
  if (status === 'vendido' || status === 'baixado') return false;
  if (condicao === 'vendido') return false;
  return true;
}

function mascararImei(imei?: unknown): string {
  const limpo = String(imei || '').replace(/\D/g, '');
  if (limpo.length < 4) return '';
  return `••••${limpo.slice(-4)}`;
}

/**
 * Formata um item de estoque pronto para copiar/enviar no WhatsApp do CRM.
 */
export function formatarItemEstoqueWhatsapp(item: EstoqueItemBridge, nomeLoja = 'PhoneCenter'): string {
  const detalhes = [item.capacidade, item.cor].filter(Boolean).join(' • ');
  const cond = item.condicao === 'novo' ? 'Lacrado / Novo' : 'Seminovo Revisado';
  const bat = item.saudeBateria ? `\n🔋 Bateria: ${item.saudeBateria}` : '';
  return [
    `📱 *${item.modelo}*${detalhes ? ` (${detalhes})` : ''}`,
    `✨ Condição: ${cond}${bat}`,
    `💰 À vista / Pix: *${formatarBRL(item.preco)}*`,
    `✅ Garantia ${nomeLoja} | Disponível pronta entrega`,
  ].join('\n');
}

export async function buscarEstoqueBridge(
  lojaId: string,
  opts: {
    q?: string;
    categoria?: string;
    condicao?: string;
    maxPreco?: number;
    limit?: number;
  } = {}
): Promise<EstoqueItemBridge[]> {
  const limit = Math.min(Math.max(Number(opts.limit) || 30, 1), 100);

  const { data, error } = await supabaseAdmin
    .from('aparelhos')
    .select(
      'id, codigo, marca, modelo, capacidade, cor, condicao, status, saude_bateria, preco, precoAtacado, quantidade, categoria, observacoes, imei, ativo'
    )
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .limit(400);

  if (error || !data) {
    return [];
  }

  let lista = (data as Record<string, unknown>[]).filter(aparelhoDisponivel);

  if (opts.categoria) {
    const cat = opts.categoria.toLowerCase();
    lista = lista.filter((a) => String(a.categoria || 'aparelho').toLowerCase() === cat);
  }
  if (opts.condicao) {
    const cond = opts.condicao.toLowerCase();
    lista = lista.filter((a) => String(a.condicao || '').toLowerCase() === cond);
  }
  if (opts.maxPreco && opts.maxPreco > 0) {
    lista = lista.filter((a) => (Number(a.preco) || 0) <= opts.maxPreco!);
  }

  if (opts.q && opts.q.trim()) {
    lista = filtrarESortearAparelhos(lista as unknown as Aparelho[], opts.q.trim()) as unknown as Record<
      string,
      unknown
    >[];
  } else {
    lista.sort((a, b) => (Number(b.preco) || 0) - (Number(a.preco) || 0));
  }

  return lista.slice(0, limit).map((ap) => {
    const status = String(ap.status || 'disponivel').toLowerCase();
    return {
      id: String(ap.id || ''),
      codigo: String(ap.codigo || ''),
      marca: String(ap.marca || 'Apple'),
      modelo: String(ap.modelo || ''),
      capacidade: String(ap.capacidade || ''),
      cor: String(ap.cor || ''),
      condicao: String(ap.condicao || 'seminovo'),
      status,
      reservado: status === 'reservado',
      saudeBateria: String(ap.saude_bateria || ''),
      preco: Number(ap.preco) || 0,
      precoAtacado: ap.precoAtacado != null ? Number(ap.precoAtacado) : null,
      quantidade: Math.max(1, Number(ap.quantidade) || 1),
      categoria: String(ap.categoria || 'aparelho'),
      observacoes: String(ap.observacoes || ''),
      imeiFinal: mascararImei(ap.imei),
    };
  });
}

export async function lookupClienteBridge(
  lojaId: string,
  params: { telefone?: string; cpf?: string; nome?: string }
): Promise<Cliente360Bridge> {
  const sufixoTel = sufixoTelefoneComparacao(params.telefone);
  const cpfLimpo = (params.cpf || '').replace(/\D/g, '');
  const nomeTermo = (params.nome || '').trim();

  let clienteRow: Record<string, unknown> | null = null;

  if (sufixoTel.length >= 8) {
    const { data } = await supabaseAdmin
      .from('clientes')
      .select('id, nome, telefone, email, cpf, cidade')
      .eq('loja_id', lojaId)
      .ilike('telefone', `%${sufixoTel}%`)
      .limit(1);
    clienteRow = (data?.[0] as Record<string, unknown>) || null;
  }

  if (!clienteRow && cpfLimpo.length >= 11) {
    const { data } = await supabaseAdmin
      .from('clientes')
      .select('id, nome, telefone, email, cpf, cidade')
      .eq('loja_id', lojaId)
      .ilike('cpf', `%${cpfLimpo.slice(-6)}%`)
      .limit(5);
    clienteRow =
      ((data || []) as Record<string, unknown>[]).find(
        (c) => String(c.cpf || '').replace(/\D/g, '') === cpfLimpo
      ) || null;
  }

  if (!clienteRow && nomeTermo.length >= 3) {
    const { data } = await supabaseAdmin
      .from('clientes')
      .select('id, nome, telefone, email, cpf, cidade')
      .eq('loja_id', lojaId)
      .ilike('nome', `%${nomeTermo}%`)
      .limit(1);
    clienteRow = (data?.[0] as Record<string, unknown>) || null;
  }

  const nomeBusca = String(clienteRow?.nome || nomeTermo || '').trim();
  const clienteId = clienteRow?.id ? String(clienteRow.id) : '';

  const [vendasRes, garantiasRes, osRes] = await Promise.all([
    clienteId
      ? supabaseAdmin
          .from('vendas')
          .select('id, aparelhoDescricao, valor, dataPagamento, metodo, status, ativo')
          .eq('loja_id', lojaId)
          .eq('clienteId', clienteId)
          .order('dataPagamento', { ascending: false })
          .limit(10)
      : nomeBusca.length >= 3
        ? supabaseAdmin
            .from('vendas')
            .select('id, aparelhoDescricao, valor, dataPagamento, metodo, status, ativo')
            .eq('loja_id', lojaId)
            .ilike('clienteNome', `%${nomeBusca}%`)
            .order('dataPagamento', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    nomeBusca.length >= 3
      ? supabaseAdmin
          .from('garantias')
          .select('aparelhoModelo, dataFim, status')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .ilike('clienteNome', `%${nomeBusca}%`)
          .order('dataFim', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
    nomeBusca.length >= 3
      ? supabaseAdmin
          .from('ordens_servico')
          .select('numeroOS, aparelhoModelo, defeito, status, dataEntrada')
          .eq('loja_id', lojaId)
          .eq('ativo', true)
          .ilike('clienteNome', `%${nomeBusca}%`)
          .order('dataEntrada', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  const comprasRaw = ((vendasRes.data || []) as Record<string, unknown>[]).filter((v) =>
    vendaConta({ status: v.status })
  );
  const compras = comprasRaw.map((v) => ({
    id: String(v.id || ''),
    aparelhoDescricao: String(v.aparelhoDescricao || 'Venda'),
    valor: Number(v.valor) || 0,
    dataPagamento: String(v.dataPagamento || ''),
    metodo: String(v.metodo || ''),
    status: String(v.status || ''),
  }));

  const garantias = ((garantiasRes.data || []) as Record<string, unknown>[]).map((g) => ({
    aparelhoModelo: String(g.aparelhoModelo || ''),
    dataFim: String(g.dataFim || ''),
    status: String(g.status || ''),
  }));

  const ordensServico = ((osRes.data || []) as Record<string, unknown>[]).map((o) => ({
    numeroOS: String(o.numeroOS || ''),
    aparelhoModelo: String(o.aparelhoModelo || ''),
    defeito: String(o.defeito || ''),
    status: String(o.status || ''),
    dataEntrada: String(o.dataEntrada || ''),
  }));

  return {
    encontrado: Boolean(clienteRow || compras.length || garantias.length || ordensServico.length),
    cliente: clienteRow
      ? {
          id: String(clienteRow.id || ''),
          nome: String(clienteRow.nome || ''),
          telefone: String(clienteRow.telefone || ''),
          email: String(clienteRow.email || ''),
          cpf: String(clienteRow.cpf || ''),
          cidade: String(clienteRow.cidade || ''),
        }
      : null,
    compras,
    garantias,
    ordensServico,
    resumo: {
      totalCompras: compras.length,
      totalGasto: compras.reduce((acc, c) => acc + c.valor, 0),
      garantiasAtivas: garantias.filter((g) => g.status.toLowerCase() === 'ativa').length,
      osAbertas: ordensServico.filter(
        (o) => !['entregue', 'cancelado'].includes(o.status.toLowerCase())
      ).length,
    },
  };
}

export function calcularTabelaParcelamento(
  saldoFinanciar: number,
  taxas: Array<{ parcelas: number; porcentagem: number }>
): ParcelaSimulada[] {
  const valor = Math.max(0, Number(saldoFinanciar) || 0);
  if (valor <= 0) return [];

  const ordenadas = [...taxas]
    .filter((t) => t.parcelas >= 1)
    .sort((a, b) => a.parcelas - b.parcelas);

  return ordenadas.map((t) => {
    const taxa = Math.max(0, Number(t.porcentagem) || 0);
    // Repasse padrão de taxa de maquininha (líquido desejado / (1 - taxa%)) com proteção < 95%
    const divisor = taxa < 95 ? 1 - taxa / 100 : 1;
    const totalComTaxa = Math.round((valor / divisor) * 100) / 100;
    const valorParcela = Math.round((totalComTaxa / t.parcelas) * 100) / 100;
    return {
      parcelas: t.parcelas,
      taxaPercentual: taxa,
      totalComTaxa,
      valorParcela,
    };
  });
}

export async function simularPropostaBridge(
  lojaId: string,
  input: {
    nomeLoja?: string;
    modeloNovo?: string;
    valorAparelho: number;
    valorTrocaManual?: number;
    entradaPix?: number;
    troca?: {
      modelo: string;
      capacidade: string;
      condicoes?: Partial<RespostaCondicaoUpgrade>;
    };
  }
): Promise<SimulacaoCompletaBridge> {
  let avaliacaoTroca: ResultadoAvaliacaoUpgrade | undefined;
  let valorTroca = Math.max(0, Number(input.valorTrocaManual) || 0);

  if (input.troca?.modelo) {
    const condicoes: RespostaCondicaoUpgrade = {
      bateriaPercentual: input.troca.condicoes?.bateriaPercentual ?? 86,
      estadoTela: input.troca.condicoes?.estadoTela ?? 'original_impecavel',
      estadoCarcaca: input.troca.condicoes?.estadoCarcaca ?? 'impecavel',
      faceIdFunciona: input.troca.condicoes?.faceIdFunciona ?? true,
      camerasFuncionam: input.troca.condicoes?.camerasFuncionam ?? true,
      temCaixaAcessorios: input.troca.condicoes?.temCaixaAcessorios ?? false,
      conectorCarregadorOk: input.troca.condicoes?.conectorCarregadorOk ?? true,
    };
    avaliacaoTroca = calcularAvaliacaoUpgrade(
      input.troca.modelo,
      input.troca.capacidade || '128GB',
      condicoes
    );
    if (!input.valorTrocaManual) {
      valorTroca = avaliacaoTroca.valorFinal;
    }
  }

  const valorAparelho = Math.max(0, Number(input.valorAparelho) || 0);
  const entradaPix = Math.max(0, Number(input.entradaPix) || 0);
  const saldoFinanciar = Math.max(0, valorAparelho - valorTroca - entradaPix);

  const { data: taxasDb } = await supabaseAdmin
    .from('taxas_maquininha')
    .select('parcelas, porcentagem')
    .eq('loja_id', lojaId)
    .eq('ativo', true)
    .order('parcelas', { ascending: true });

  const taxas =
    taxasDb && taxasDb.length > 0
      ? (taxasDb as Array<{ parcelas: number; porcentagem: number }>).map((t) => ({
          parcelas: Number(t.parcelas),
          porcentagem: Number(t.porcentagem),
        }))
      : TAXAS_PADRAO_FALLBACK;

  const parcelamento = calcularTabelaParcelamento(saldoFinanciar, taxas);
  const destaques = parcelamento.filter((p) => [6, 10, 12, 18].includes(p.parcelas));
  const listaParcelasTexto = (destaques.length ? destaques : parcelamento.slice(0, 4))
    .map((p) => `💳 ${p.parcelas}x de *${formatarBRL(p.valorParcela)}*`)
    .join('\n');

  const linhas: string[] = [
    `📋 *ORÇAMENTO — ${(input.nomeLoja || 'PhoneCenter').toUpperCase()}*`,
  ];
  if (input.modeloNovo) {
    linhas.push(`📱 Aparelho: *${input.modeloNovo}*`);
  }
  linhas.push(`💰 Valor à vista: *${formatarBRL(valorAparelho)}*`);
  if (valorTroca > 0) {
    const descTroca = input.troca?.modelo
      ? `${input.troca.modelo} ${input.troca.capacidade || ''}`.trim()
      : 'Aparelho usado';
    linhas.push(`🔄 Troca (${descTroca}): *-${formatarBRL(valorTroca)}*`);
  }
  if (entradaPix > 0) {
    linhas.push(`⚡ Entrada Pix: *-${formatarBRL(entradaPix)}*`);
  }
  linhas.push(`✅ *Saldo restante: ${formatarBRL(saldoFinanciar)}*`);
  if (listaParcelasTexto) {
    linhas.push('', '*Opções no Cartão:*', listaParcelasTexto);
  }
  linhas.push('', '_Simulação sujeita à conferência presencial do aparelho._');

  return {
    valorAparelho,
    valorTroca,
    entradaPix,
    saldoFinanciar,
    avaliacaoTroca,
    parcelamento,
    textoWhatsapp: linhas.join('\n'),
  };
}

export async function obterRankingVendasBridge(
  lojaId: string,
  dias = 30
): Promise<RankingVendasBridge> {
  const periodoDias = Math.min(Math.max(Number(dias) || 30, 1), 365);
  const desde = new Date(Date.now() - periodoDias * 86400 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from('vendas')
    .select('id, valor, status, ativo, dataPagamento, aparelhoDescricao, vendedor, descricao')
    .eq('loja_id', lojaId)
    .gte('dataPagamento', desde)
    .limit(1000);

  const validas = ((data || []) as Record<string, unknown>[]).filter(
    (v) => v.ativo !== false && vendaConta({ status: v.status })
  );

  const porVendedor = new Map<string, { quantidade: number; faturamento: number }>();
  const porModelo = new Map<string, { quantidade: number; faturamento: number }>();

  let faturamentoTotal = 0;

  for (const v of validas) {
    const valor = Number(v.valor) || 0;
    faturamentoTotal += valor;

    const vendedor = String(v.vendedor || '').trim() || 'Equipe Loja';
    const curV = porVendedor.get(vendedor) || { quantidade: 0, faturamento: 0 };
    curV.quantidade += 1;
    curV.faturamento += valor;
    porVendedor.set(vendedor, curV);

    const modelo = String(v.aparelhoDescricao || 'Aparelho').split(' - ')[0].trim();
    const curM = porModelo.get(modelo) || { quantidade: 0, faturamento: 0 };
    curM.quantidade += 1;
    curM.faturamento += valor;
    porModelo.set(modelo, curM);
  }

  const ranking: RankingVendedorItem[] = Array.from(porVendedor.entries())
    .map(([vendedor, stats]) => ({
      vendedor,
      quantidade: stats.quantidade,
      faturamento: Math.round(stats.faturamento * 100) / 100,
      ticketMedio:
        stats.quantidade > 0 ? Math.round((stats.faturamento / stats.quantidade) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.faturamento - a.faturamento);

  const topModelos = Array.from(porModelo.entries())
    .map(([modelo, stats]) => ({
      modelo,
      quantidade: stats.quantidade,
      faturamento: Math.round(stats.faturamento * 100) / 100,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  return {
    periodoDias,
    totalVendas: validas.length,
    faturamentoTotal: Math.round(faturamentoTotal * 100) / 100,
    ticketMedioGeral:
      validas.length > 0 ? Math.round((faturamentoTotal / validas.length) * 100) / 100 : 0,
    ranking,
    topModelos,
  };
}

export { MODELOS_UPGRADE_DISPONIVEIS };
