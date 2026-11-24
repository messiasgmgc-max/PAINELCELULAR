import { vendaConta } from '@/lib/vendas/situacao';

export interface DataNascimentoPartes {
  dia: number;
  mes: number;
  ano?: number;
}

export interface InfoAniversario {
  dataFormatada: string;
  idade: number | null;
  aniversarioHoje: boolean;
  aniversarioNoMes: boolean;
  diasParaAniversario: number | null;
  dia: number | null;
  mes: number | null;
  ano: number | null;
}

export interface VendaParaResumoCliente {
  id: string;
  clienteId?: string | null;
  clienteNome?: string | null;
  itens?: unknown;
  aparelhoDescricao?: string | null;
  descricao?: string | null;
  valor?: number | string | null;
  dataPagamento?: string | null;
  created_at?: string | null;
  metodo?: string | null;
  status?: string | null;
  ativo?: boolean | null;
}

export interface ClienteParaResumo {
  id: string;
  nome: string;
}

export interface CompraResumoCliente {
  id: string;
  produto: string;
  itens: string[];
  data: string | null;
  valor: number;
  metodo: string;
  status: string;
}

export interface ResumoComprasCliente {
  ultimoProduto: string;
  itensUltimaCompra: string[];
  dataUltimaCompra: string | null;
  valorUltimaCompra: number;
  totalCompras: number;
  totalGasto: number;
  historico: CompraResumoCliente[];
}

const NOMES_GENERICOS = new Set([
  'cliente',
  'cliente consumidor',
  'cliente balcao',
  'consumidor',
  'consumidor final',
  'balcao',
  'avulso',
  'cliente avulso',
  'venda avulsa',
]);

export function normalizarTextoComparacao(valor: string | null | undefined): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function emailEhPlaceholder(email: string | null | undefined): boolean {
  const limpo = String(email || '').trim().toLowerCase();
  if (!limpo) return true;
  return limpo === 'sem@email.com' || limpo.endsWith('@sem-email.local');
}

function dataCalendarioValida(dia: number, mes: number, ano?: number): boolean {
  if (!Number.isInteger(dia) || !Number.isInteger(mes)) return false;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const anoCheck = ano ?? 2024; // ano bissexto quando o ano não é informado
  const teste = new Date(anoCheck, mes - 1, dia);
  return (
    teste.getFullYear() === anoCheck &&
    teste.getMonth() === mes - 1 &&
    teste.getDate() === dia
  );
}

/**
 * Faz o parse de datas de nascimento nos formatos mais comuns salvos no painel:
 * `YYYY-MM-DD`, ISO timestamp, `DD/MM/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY`, `DDMMYYYY` e `DD/MM`.
 */
export function parseDataNascimento(valor: string | null | undefined): DataNascimentoPartes | null {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  // YYYY-MM-DD ou ISO timestamp (ex: 1995-05-12 ou 1995-05-12T00:00:00Z)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/.exec(texto);
  if (isoMatch) {
    const ano = Number(isoMatch[1]);
    const mes = Number(isoMatch[2]);
    const dia = Number(isoMatch[3]);
    if (ano >= 1900 && ano <= 2100 && dataCalendarioValida(dia, mes, ano)) {
      return { dia, mes, ano };
    }
    return null;
  }

  // DD/MM/YYYY, DD-MM-YYYY ou DD.MM.YYYY
  const brMatch = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(texto);
  if (brMatch) {
    const dia = Number(brMatch[1]);
    const mes = Number(brMatch[2]);
    const ano = Number(brMatch[3]);
    if (ano >= 1900 && ano <= 2100 && dataCalendarioValida(dia, mes, ano)) {
      return { dia, mes, ano };
    }
    return null;
  }

  // DD/MM (sem ano)
  const diaMesMatch = /^(\d{1,2})[\/.\-](\d{1,2})$/.exec(texto);
  if (diaMesMatch) {
    const dia = Number(diaMesMatch[1]);
    const mes = Number(diaMesMatch[2]);
    if (dataCalendarioValida(dia, mes)) {
      return { dia, mes };
    }
    return null;
  }

  // 8 dígitos corridos DDMMYYYY
  const digitosMatch = /^(\d{2})(\d{2})(\d{4})$/.exec(texto);
  if (digitosMatch) {
    const dia = Number(digitosMatch[1]);
    const mes = Number(digitosMatch[2]);
    const ano = Number(digitosMatch[3]);
    if (ano >= 1900 && ano <= 2100 && dataCalendarioValida(dia, mes, ano)) {
      return { dia, mes, ano };
    }
  }

  return null;
}

export function formatarDataNascimento(valor: string | null | undefined): string | null {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const partes = parseDataNascimento(texto);
  if (!partes) return texto;

  const dd = String(partes.dia).padStart(2, '0');
  const mm = String(partes.mes).padStart(2, '0');
  if (partes.ano) {
    return `${dd}/${mm}/${partes.ano}`;
  }
  return `${dd}/${mm}`;
}

export function dataNascimentoParaInput(valor: string | null | undefined): string {
  const partes = parseDataNascimento(valor);
  if (!partes?.ano) return '';
  const yyyy = String(partes.ano).padStart(4, '0');
  const mm = String(partes.mes).padStart(2, '0');
  const dd = String(partes.dia).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function criarDataAniversarioNoAno(ano: number, mes: number, dia: number): Date {
  // Para nascidos em 29/02 em anos não bissextos, considera 28/02.
  if (mes === 2 && dia === 29 && !dataCalendarioValida(29, 2, ano)) {
    return new Date(ano, 1, 28);
  }
  return new Date(ano, mes - 1, dia);
}

export function calcularInfoAniversario(
  valor: string | null | undefined,
  hoje: Date = new Date()
): InfoAniversario | null {
  const texto = String(valor || '').trim();
  if (!texto) return null;

  const partes = parseDataNascimento(texto);
  if (!partes) {
    return {
      dataFormatada: texto,
      idade: null,
      aniversarioHoje: false,
      aniversarioNoMes: false,
      diasParaAniversario: null,
      dia: null,
      mes: null,
      ano: null,
    };
  }

  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();

  let idade: number | null = null;
  if (partes.ano) {
    let anos = anoHoje - partes.ano;
    if (mesHoje < partes.mes || (mesHoje === partes.mes && diaHoje < partes.dia)) {
      anos -= 1;
    }
    if (anos >= 0 && anos <= 130) {
      idade = anos;
    }
  }

  const hojeZerado = new Date(anoHoje, mesHoje - 1, diaHoje);
  let proximo = criarDataAniversarioNoAno(anoHoje, partes.mes, partes.dia);
  if (proximo.getTime() < hojeZerado.getTime()) {
    proximo = criarDataAniversarioNoAno(anoHoje + 1, partes.mes, partes.dia);
  }
  const diasParaAniversario = Math.round(
    (proximo.getTime() - hojeZerado.getTime()) / (1000 * 60 * 60 * 24)
  );

  const aniversarioHoje = diasParaAniversario === 0;
  const aniversarioNoMes = partes.mes === mesHoje;

  return {
    dataFormatada: formatarDataNascimento(texto) || texto,
    idade,
    aniversarioHoje,
    aniversarioNoMes,
    diasParaAniversario,
    dia: partes.dia,
    mes: partes.mes,
    ano: partes.ano ?? null,
  };
}

function normalizarListaItens(itensRaw: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(itensRaw)) {
    return itensRaw.filter((i): i is Record<string, unknown> => Boolean(i && typeof i === 'object'));
  }
  if (typeof itensRaw === 'string' && itensRaw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(itensRaw);
      if (Array.isArray(parsed)) {
        return parsed.filter((i): i is Record<string, unknown> => Boolean(i && typeof i === 'object'));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function limparDescricaoVendaLegada(descricao: string): string {
  return descricao
    .replace(/^Venda\s+Gerada\s+por\s+IA\s*-\s*/i, '')
    .replace(/^Venda\s+VAREJO\s*-\s*/i, '')
    .replace(/^Upgrade:\s*Venda\s+/i, '')
    .replace(/\s+para\s+[^-()]+$/i, '')
    .trim();
}

export function extrairProdutosDaVenda(venda: Pick<VendaParaResumoCliente, 'itens' | 'aparelhoDescricao' | 'descricao'>): {
  resumo: string;
  itens: string[];
} {
  const itensObj = normalizarListaItens(venda.itens);
  const labelsItens: string[] = [];

  for (const item of itensObj) {
    const descBase = String(item.descricao || item.modelo || item.nome || '').trim();
    if (!descBase) continue;
    const qtd = Number(item.quantidade) || 1;
    labelsItens.push(qtd > 1 ? `${descBase} (x${qtd})` : descBase);
  }

  if (labelsItens.length === 1) {
    return { resumo: labelsItens[0], itens: labelsItens };
  }
  if (labelsItens.length > 1) {
    const extras = labelsItens.length - 1;
    return {
      resumo: `${labelsItens[0]} (+${extras} ${extras === 1 ? 'item' : 'itens'})`,
      itens: labelsItens,
    };
  }

  const aparelhoDesc = String(venda.aparelhoDescricao || '').trim();
  if (aparelhoDesc) {
    return { resumo: aparelhoDesc, itens: [aparelhoDesc] };
  }

  const descRaw = String(venda.descricao || '').trim();
  if (descRaw) {
    const limpa = limparDescricaoVendaLegada(descRaw) || descRaw;
    return { resumo: limpa, itens: [limpa] };
  }

  return { resumo: 'Produto não especificado', itens: [] };
}

function timestampVenda(venda: VendaParaResumoCliente): number {
  const raw = venda.dataPagamento || venda.created_at || '';
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Associa vendas válidas (não canceladas e ativas) aos clientes da loja,
 * priorizando vínculo exato por `clienteId` e usando fallback seguro por nome normalizado.
 */
export function mapearComprasPorCliente(
  clientes: ClienteParaResumo[],
  vendas: VendaParaResumoCliente[]
): Map<string, ResumoComprasCliente> {
  const idsValidos = new Set<string>();
  const contagemPorNome = new Map<string, number>();
  const idUnicoPorNome = new Map<string, string>();

  for (const c of clientes) {
    idsValidos.add(c.id);
    const nomeNorm = normalizarTextoComparacao(c.nome);
    if (!nomeNorm || NOMES_GENERICOS.has(nomeNorm)) continue;
    contagemPorNome.set(nomeNorm, (contagemPorNome.get(nomeNorm) || 0) + 1);
    idUnicoPorNome.set(nomeNorm, c.id);
  }

  // Se houver homônimos exatos na base, evita atribuir vendas sem clienteId ao cliente errado.
  for (const [nomeNorm, qtd] of contagemPorNome.entries()) {
    if (qtd > 1) {
      idUnicoPorNome.delete(nomeNorm);
    }
  }

  const vendasValidas = vendas
    .filter((v) => vendaConta({ status: v.status }) && v.ativo !== false)
    .slice()
    .sort((a, b) => {
      const diff = timestampVenda(b) - timestampVenda(a);
      if (diff !== 0) return diff;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

  const historicoPorCliente = new Map<string, CompraResumoCliente[]>();

  for (const venda of vendasValidas) {
    let clienteIdResolvido: string | null = null;

    if (venda.clienteId && idsValidos.has(venda.clienteId)) {
      clienteIdResolvido = venda.clienteId;
    } else if (!venda.clienteId) {
      const nomeVendaNorm = normalizarTextoComparacao(venda.clienteNome);
      if (nomeVendaNorm && !NOMES_GENERICOS.has(nomeVendaNorm)) {
        clienteIdResolvido = idUnicoPorNome.get(nomeVendaNorm) || null;
      }
    }

    if (!clienteIdResolvido) continue;

    const { resumo, itens } = extrairProdutosDaVenda(venda);
    const compra: CompraResumoCliente = {
      id: venda.id,
      produto: resumo,
      itens,
      data: venda.dataPagamento || venda.created_at || null,
      valor: Number(venda.valor) || 0,
      metodo: String(venda.metodo || ''),
      status: String(venda.status || 'pago'),
    };

    const lista = historicoPorCliente.get(clienteIdResolvido);
    if (lista) {
      lista.push(compra);
    } else {
      historicoPorCliente.set(clienteIdResolvido, [compra]);
    }
  }

  const resultado = new Map<string, ResumoComprasCliente>();
  for (const [clienteId, historico] of historicoPorCliente.entries()) {
    const maisRecente = historico[0];
    const totalGasto = historico.reduce((acc, item) => acc + item.valor, 0);
    resultado.set(clienteId, {
      ultimoProduto: maisRecente.produto,
      itensUltimaCompra: maisRecente.itens,
      dataUltimaCompra: maisRecente.data,
      valorUltimaCompra: maisRecente.valor,
      totalCompras: historico.length,
      totalGasto,
      historico,
    });
  }

  return resultado;
}

export function montarLinkWhatsappCliente(
  telefone: string | null | undefined,
  nome: string,
  aniversarioHoje = false
): string | null {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return null;
  const comDdi = digitos.length <= 11 ? `55${digitos}` : digitos;
  if (aniversarioHoje) {
    const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'Cliente';
    const msg = encodeURIComponent(
      `Olá ${primeiroNome}! 🎉 Feliz aniversário! Desejamos muitas felicidades no seu dia especial. Conte sempre com a nossa loja!`
    );
    return `https://wa.me/${comDdi}?text=${msg}`;
  }
  return `https://wa.me/${comDdi}`;
}

export function obterIniciaisCliente(nome: string | null | undefined): string {
  const partes = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return 'CL';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}
