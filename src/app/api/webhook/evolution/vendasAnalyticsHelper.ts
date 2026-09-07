export interface ResumoVendasAgregado {
  hoje: {
    total: number;
    qtd: number;
    varejo: number;
    varejoQtd: number;
    atacado: number;
    atacadoQtd: number;
    itensFormatados: string;
    resumoTexto: string;
  };
  semana: {
    total: number;
    qtd: number;
    varejo: number;
    varejoQtd: number;
    atacado: number;
    atacadoQtd: number;
    resumoTexto: string;
  };
  mes: {
    total: number;
    qtd: number;
    varejo: number;
    varejoQtd: number;
    atacado: number;
    atacadoQtd: number;
    resumoTexto: string;
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

  const calcularTotais = (lista: any[]) => {
    let total = 0;
    let varejo = 0;
    let atacado = 0;
    let varejoQtd = 0;
    let atacadoQtd = 0;

    for (const v of lista) {
      const val = Number(v.valor || 0);
      total += val;
      const tipo = classificarTipoVenda(v);
      if (tipo === 'Atacado') {
        atacado += val;
        atacadoQtd++;
      } else {
        varejo += val;
        varejoQtd++;
      }
    }

    return {
      total,
      qtd: lista.length,
      varejo,
      varejoQtd,
      atacado,
      atacadoQtd,
    };
  };

  const tHoje = calcularTotais(hojeVendas);
  const tSemana = calcularTotais(semanaVendas);
  const tMes = calcularTotais(mesVendas);

  // Itens formatados de hoje
  const itensHojeFormatados = hojeVendas.length > 0
    ? hojeVendas
        .map((v) => {
          const desc = extrairDescricaoItens(v);
          const tipo = classificarTipoVenda(v);
          const cliente = v.clienteNome ? ` (${v.clienteNome})` : '';
          return `• ${desc}${cliente} - R$ ${formatarMoeda(v.valor)} [${tipo}]`;
        })
        .join('\n')
    : 'Nenhum aparelho vendido hoje até o momento.';

  // Resumo Hoje
  const resumoTextoHoje = tHoje.qtd > 0
    ? `Total: R$ ${formatarMoeda(tHoje.total)} (${tHoje.qtd} ${tHoje.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tHoje.varejo)} (${tHoje.varejoQtd}) | Atacado: R$ ${formatarMoeda(tHoje.atacado)} (${tHoje.atacadoQtd})`
    : 'Nenhuma venda registrada hoje até o momento.';

  // Resumo Semana
  const resumoTextoSemana = tSemana.qtd > 0
    ? `Total: R$ ${formatarMoeda(tSemana.total)} (${tSemana.qtd} ${tSemana.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tSemana.varejo)} (${tSemana.varejoQtd}) | Atacado: R$ ${formatarMoeda(tSemana.atacado)} (${tSemana.atacadoQtd})`
    : 'Nenhuma venda registrada nos últimos 7 dias.';

  // Resumo Mês
  const resumoTextoMes = tMes.qtd > 0
    ? `Total: R$ ${formatarMoeda(tMes.total)} (${tMes.qtd} ${tMes.qtd === 1 ? 'venda' : 'vendas'}) | Varejo: R$ ${formatarMoeda(tMes.varejo)} (${tMes.varejoQtd}) | Atacado: R$ ${formatarMoeda(tMes.atacado)} (${tMes.atacadoQtd})`
    : 'Nenhuma venda registrada este mês.';

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
          return `• ${dt} - ${cliente}: ${desc} - R$ ${formatarMoeda(v.valor)} (${statusPag})`;
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
          return `• ${dt} [${tipo}] ${desc}${cliente} - R$ ${formatarMoeda(v.valor)}`;
        })
        .join('\n')
    : 'Nenhuma venda registrada no histórico da loja.';

  return {
    hoje: {
      ...tHoje,
      itensFormatados: itensHojeFormatados,
      resumoTexto: resumoTextoHoje,
    },
    semana: {
      ...tSemana,
      resumoTexto: resumoTextoSemana,
    },
    mes: {
      ...tMes,
      resumoTexto: resumoTextoMes,
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

  // 1. Busca vendas do período (mês ou semana, o que for mais antigo)
  const { data: vendasPeriodo } = await supabase
    .from('vendas')
    .select('id, clienteNome, valor, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao, itens, dataPagamento')
    .eq('loja_id', lojaId)
    .gte('dataPagamento', inicioConsulta.toISOString())
    .order('dataPagamento', { ascending: false });

  // 2. Busca as 10 últimas vendas gerais da loja para histórico recente
  const { data: ultimasVendasGeral } = await supabase
    .from('vendas')
    .select('id, clienteNome, valor, valorPago, saldoDevedor, metodo, status, tipoEntrega, descricao, itens, dataPagamento')
    .eq('loja_id', lojaId)
    .order('dataPagamento', { ascending: false })
    .limit(10);

  return processarAnaliticaVendas(vendasPeriodo || [], ultimasVendasGeral || [], dataReferencia);
}
