export interface ResumoVendasTotais {
  total: number;
  qtd: number;
  custoTotal: number;
  lucroTotal: number;
  margemPercentual: number;
  varejo: number;
  varejoQtd: number;
  varejoLucro: number;
  atacado: number;
  atacadoQtd: number;
  atacadoLucro: number;
}

export interface ResumoVendasAgregado {
  hoje: ResumoVendasTotais & {
    itensFormatados: string;
    resumoTexto: string;
    resumoLucroTexto: string;
  };
  semana: ResumoVendasTotais & {
    resumoTexto: string;
    resumoLucroTexto: string;
  };
  mes: ResumoVendasTotais & {
    resumoTexto: string;
    resumoLucroTexto: string;
  };
  historicoAtacadoMes: string;
  historicoRecente: string;
}

export function classificarTipoVenda(v: any): 'Atacado' | 'Varejo' {
  const tipoEntregaLower = String(v?.tipoEntrega || '').toLowerCase();
  const descLower = String(v?.descricao || '').toLowerCase();
  if (tipoEntregaLower.includes('atacado') || descLower.includes('atacado')) {
    return 'Atacado';
  }
  return 'Varejo';
}

function formatarMoeda(val: number): string {
  return Number(val || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarDataCurta(isoStr?: string): string {
  if (!isoStr) return '--/--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '--/--';
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

function extrairDescricaoItens(v: any): string {
  if (Array.isArray(v.itens) && v.itens.length > 0) {
    const desc = v.itens
      .map((it: any) => it.descricao || it.modelo || 'Item')
      .filter(Boolean)
      .join(', ');
    if (desc) return desc;
  }
  if (v.descricao && typeof v.descricao === 'string') {
    return v.descricao.replace(/^venda registrada[^:]*:\s*/i, '').trim();
  }
  return 'Aparelho/Venda';
}

export function processarAnaliticaVendas(
  vendas: any[],
  ultimasVendasGeral?: any[],
  dataReferencia: Date = new Date()
): ResumoVendasAgregado {
  const agora = new Date(dataReferencia);

  const hojeInicio = new Date(agora);
  hojeInicio.setHours(0, 0, 0, 0);

  const semanaInicio = new Date(agora);
  semanaInicio.setDate(semanaInicio.getDate() - 7);
  semanaInicio.setHours(0, 0, 0, 0);

  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);

  const hojeVendas: any[] = [];
  const semanaVendas: any[] = [];
  const mesVendas: any[] = [];

  for (const v of vendas || []) {
    const dt = v.dataPagamento ? new Date(v.dataPagamento) : null;
    if (!dt || isNaN(dt.getTime())) continue;

    if (dt >= hojeInicio) {
      hojeVendas.push(v);
    }
    if (dt >= semanaInicio) {
      semanaVendas.push(v);
    }
    if (dt >= mesInicio) {
      mesVendas.push(v);
    }
  }

  const calcularTotais = (lista: any[]): ResumoVendasTotais => {
    let total = 0;
    let custoTotal = 0;
    let lucroTotal = 0;
    let varejo = 0;
    let varejoQtd = 0;
    let varejoLucro = 0;
    let atacado = 0;
    let atacadoQtd = 0;
    let atacadoLucro = 0;

    for (const v of lista) {
      const val = Number(v.valor || 0);
      let c = Number(v.custo || 0);
      // Se custo não estiver na venda mas tiver nos itens, soma custo dos itens
      if (c === 0 && Array.isArray(v.itens) && v.itens.length > 0) {
        c = v.itens.reduce((acc: number, it: any) => acc + Number(it.custoUnitario || it.custo || it.valorInterno || 0), 0);
      }
      
      let l = Number(v.lucro !== undefined && v.lucro !== null ? v.lucro : (val - c));
      // Se não havia custo nem lucro registrado, não assume lucro negativo artificial
      if (c === 0 && (v.lucro === undefined || v.lucro === null)) {
        l = 0;
      }

      total += val;
      custoTotal += c;
      lucroTotal += l;

      const tipo = classificarTipoVenda(v);
      if (tipo === 'Atacado') {
        atacado += val;
        atacadoQtd++;
        atacadoLucro += l;
      } else {
        varejo += val;
        varejoQtd++;
        varejoLucro += l;
      }
    }

    const margemPercentual = total > 0 ? (lucroTotal / total) * 100 : 0;

    return {
      total,
      qtd: lista.length,
      custoTotal,
      lucroTotal,
      margemPercentual,
      varejo,
      varejoQtd,
      varejoLucro,
      atacado,
      atacadoQtd,
      atacadoLucro,
    };
  };

  const tHoje = calcularTotais(hojeVendas);
  const tSemana = calcularTotais(semanaVendas);
  const tMes = calcularTotais(mesVendas);

  // Itens formatados de hoje (com lucro e custo se disponíveis)
  const itensHojeFormatados = hojeVendas.length > 0
    ? hojeVendas
        .map((v) => {
          const desc = extrairDescricaoItens(v);
          const tipo = classificarTipoVenda(v);
          const cliente = v.clienteNome ? ` (${v.clienteNome})` : '';
          const custoStr = v.custo ? ` | Custo: R$ ${formatarMoeda(v.custo)}` : '';
          const lucroStr = v.lucro !== undefined && v.lucro !== null ? ` | Lucro: R$ ${formatarMoeda(v.lucro)}` : '';
          return `• ${desc}${cliente} - R$ ${formatarMoeda(v.valor)} [${tipo}]${custoStr}${lucroStr}`;
        })
        .join('\n')
    : 'Nenhum aparelho vendido hoje até o momento.';

  // Resumo Hoje
  const resumoTextoHoje = tHoje.qtd > 0
    ? `Total: R$ ${formatarMoeda(tHoje.total)} (${tHoje.qtd} ${tHoje.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tHoje.varejo)} (${tHoje.varejoQtd}) | Atacado: R$ ${formatarMoeda(tHoje.atacado)} (${tHoje.atacadoQtd})`
    : 'Nenhuma venda registrada hoje até o momento.';

  const resumoLucroHoje = tHoje.qtd > 0
    ? `Lucro Hoje: R$ ${formatarMoeda(tHoje.lucroTotal)} (Margem: ${tHoje.margemPercentual.toFixed(1)}% | Custo: R$ ${formatarMoeda(tHoje.custoTotal)}) | Lucro Varejo: R$ ${formatarMoeda(tHoje.varejoLucro)} | Lucro Atacado: R$ ${formatarMoeda(tHoje.atacadoLucro)}`
    : 'Sem lucro registrado hoje.';

  // Resumo Semana
  const resumoTextoSemana = tSemana.qtd > 0
    ? `Total: R$ ${formatarMoeda(tSemana.total)} (${tSemana.qtd} ${tSemana.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tSemana.varejo)} (${tSemana.varejoQtd}) | Atacado: R$ ${formatarMoeda(tSemana.atacado)} (${tSemana.atacadoQtd})`
    : 'Nenhuma venda registrada nos últimos 7 dias.';

  const resumoLucroSemana = tSemana.qtd > 0
    ? `Lucro Semana: R$ ${formatarMoeda(tSemana.lucroTotal)} (Margem: ${tSemana.margemPercentual.toFixed(1)}% | Custo: R$ ${formatarMoeda(tSemana.custoTotal)})`
    : 'Sem lucro registrado na semana.';

  // Resumo Mês
  const resumoTextoMes = tMes.qtd > 0
    ? `Total: R$ ${formatarMoeda(tMes.total)} (${tMes.qtd} ${tMes.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tMes.varejo)} (${tMes.varejoQtd}) | Atacado: R$ ${formatarMoeda(tMes.atacado)} (${tMes.atacadoQtd})`
    : 'Nenhuma venda registrada este mês.';

  const resumoLucroMes = tMes.qtd > 0
    ? `Lucro Mês: R$ ${formatarMoeda(tMes.lucroTotal)} (Margem: ${tMes.margemPercentual.toFixed(1)}% | Custo: R$ ${formatarMoeda(tMes.custoTotal)})`
    : 'Sem lucro registrado no mês.';

  // Histórico Atacado do Mês
  const atacadoMesLista = mesVendas.filter((v) => classificarTipoVenda(v) === 'Atacado');
  const historicoAtacadoMes = atacadoMesLista.length > 0
    ? atacadoMesLista
        .slice(0, 10)
        .map((v) => {
          const dt = formatarDataCurta(v.dataPagamento);
          const cliente = v.clienteNome || 'Lojista parceiro';
          const desc = extrairDescricaoItens(v);
          const statusPag = v.status === 'pendente' || (v.saldoDevedor && Number(v.saldoDevedor) > 0)
            ? 'Pendente'
            : (v.metodo || 'Pago');
          const lucroStr = v.lucro !== undefined && v.lucro !== null ? ` | Lucro: R$ ${formatarMoeda(v.lucro)}` : '';
          return `• ${dt} - ${cliente}: ${desc} - R$ ${formatarMoeda(v.valor)}${lucroStr} (${statusPag})`;
        })
        .join('\n')
    : 'Nenhuma venda de atacado registrada neste mês.';

  // Histórico Recente Geral
  const baseRecente = (ultimasVendasGeral && ultimasVendasGeral.length > 0)
    ? ultimasVendasGeral
    : vendas.slice(0, 8);

  const historicoRecente = baseRecente && baseRecente.length > 0
    ? baseRecente
        .slice(0, 8)
        .map((v) => {
          const dt = formatarDataCurta(v.dataPagamento);
          const tipo = classificarTipoVenda(v);
          const cliente = v.clienteNome ? ` (${v.clienteNome})` : '';
          const desc = extrairDescricaoItens(v);
          const custoStr = v.custo ? ` | Custo: R$ ${formatarMoeda(v.custo)}` : '';
          const lucroStr = v.lucro !== undefined && v.lucro !== null ? ` | Lucro: R$ ${formatarMoeda(v.lucro)}` : '';
          return `• ${dt} [${tipo}] ${desc}${cliente} - R$ ${formatarMoeda(v.valor)}${custoStr}${lucroStr}`;
        })
        .join('\n')
    : 'Nenhuma venda registrada no histórico da loja.';

  return {
    hoje: {
      ...tHoje,
      itensFormatados: itensHojeFormatados,
      resumoTexto: resumoTextoHoje,
      resumoLucroTexto: resumoLucroHoje,
    },
    semana: {
      ...tSemana,
      resumoTexto: resumoTextoSemana,
      resumoLucroTexto: resumoLucroSemana,
    },
    mes: {
      ...tMes,
      resumoTexto: resumoTextoMes,
      resumoLucroTexto: resumoLucroMes,
    },
    historicoAtacadoMes,
    historicoRecente,
  };
}

export async function buscarResumoVendasLoja(
  supabase: any,
  lojaId: string,
  dataReferencia: Date = new Date()
): Promise<ResumoVendasAgregado> {
  const agora = new Date(dataReferencia);
  const semanaInicio = new Date(agora);
  semanaInicio.setDate(semanaInicio.getDate() - 7);
  semanaInicio.setHours(0, 0, 0, 0);

  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, 0);

  const inicioConsulta = mesInicio.getTime() < semanaInicio.getTime() ? mesInicio : semanaInicio;

  // 1. Busca vendas do período (mês ou semana, o que for mais antigo) incluindo custo, lucro e margem
  const { data: vendasPeriodo } = await supabase
    .from('vendas')
    .select('id, clienteNome, valor, custo, lucro, percentualLucro, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao, itens, dataPagamento')
    .eq('loja_id', lojaId)
    .gte('dataPagamento', inicioConsulta.toISOString())
    .order('dataPagamento', { ascending: false });

  // 2. Busca as 10 últimas vendas gerais da loja para histórico recente
  const { data: ultimasVendasGeral } = await supabase
    .from('vendas')
    .select('id, clienteNome, valor, custo, lucro, percentualLucro, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao, itens, dataPagamento')
    .eq('loja_id', lojaId)
    .order('dataPagamento', { ascending: false })
    .limit(10);

  return processarAnaliticaVendas(vendasPeriodo || [], ultimasVendasGeral || [], dataReferencia);
}
