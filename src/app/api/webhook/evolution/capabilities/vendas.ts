import { Capability, dataBr, descreverAparelho, moeda, numero, texto } from './core';

const METODOS_VALIDOS = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'boleto', 'fiado', 'trade_in'];

function normalizarMetodo(valor: string): string {
  const limpo = valor.toLowerCase().replace(/[\s-]/g, '_');
  if (METODOS_VALIDOS.includes(limpo)) return limpo;
  if (limpo.includes('credito')) return 'cartao_credito';
  if (limpo.includes('debito')) return 'cartao_debito';
  if (limpo.includes('prazo') || limpo.includes('fiado')) return 'fiado';
  if (limpo.includes('pix')) return 'pix';
  return 'dinheiro';
}

/** Intervalo [inicio, fim) para os períodos que o lojista costuma pedir. */
function intervaloPeriodo(periodo: string): { inicio: Date; fim: Date; rotulo: string } {
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim = new Date(hoje.getTime() + 24 * 60 * 60 * 1000);
  const p = periodo.toLowerCase();

  if (p.includes('ontem')) {
    const inicio = new Date(hoje.getTime() - 24 * 60 * 60 * 1000);
    return { inicio, fim: hoje, rotulo: 'ontem' };
  }
  if (p.includes('semana')) {
    return { inicio: new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000), fim, rotulo: 'nos últimos 7 dias' };
  }
  if (p.includes('mes') || p.includes('mês')) {
    return { inicio: new Date(agora.getFullYear(), agora.getMonth(), 1), fim, rotulo: 'neste mês' };
  }
  if (p.includes('ano')) {
    return { inicio: new Date(agora.getFullYear(), 0, 1), fim, rotulo: 'neste ano' };
  }
  return { inicio: hoje, fim, rotulo: 'hoje' };
}

export const capabilitiesVendas: Capability[] = [
  {
    action: 'create_venda',
    titulo: 'Registrar venda',
    descricao: 'Registrar a venda/baixa de um aparelho',
    recurso: 'vendas',
    papeis: ['owner', 'staff'],
    escrita: true,
    atalho: '!vender',
    parametros: [
      { nome: 'modelo', descricao: 'modelo do aparelho vendido', obrigatorio: true },
      { nome: 'comprador', descricao: 'nome do comprador', obrigatorio: true },
      { nome: 'valor', descricao: 'valor da venda', obrigatorio: true },
      { nome: 'formaPagamento', descricao: 'pix | dinheiro | cartao_credito | cartao_debito | fiado' },
      { nome: 'tipoEntrega', descricao: 'Varejo ou Atacado' },
      { nome: 'imei', descricao: 'IMEI do aparelho vendido' },
    ],
    exemplos: [
      '"vendi o 13 pro pro Lucas por 2500 no atacado" -> {"modelo":"iPhone 13 Pro","comprador":"Lucas","valor":2500,"tipoEntrega":"Atacado"}',
    ],
    async executar(ctx, params) {
      const modelo = texto(params, 'modelo', 'aparelho');
      const comprador = texto(params, 'comprador', 'cliente', 'clienteNome');
      const valor = numero(params, 'valor', 'valorVenda', 'preco');
      const imei = texto(params, 'imei');

      if (!modelo) return '⚠️ Qual aparelho foi vendido?';
      if (!comprador) return `⚠️ Para quem você vendeu o *${modelo}*?`;
      if (valor <= 0) return `⚠️ Por quanto o *${modelo}* foi vendido?`;

      // Localiza o aparelho para dar baixa no estoque e capturar o custo real.
      let query = ctx.supabase
        .from('aparelhos')
        .select('id, marca, modelo, capacidade, cor, imei, preco, custo')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true);
      query = imei ? query.eq('imei', imei) : query.ilike('modelo', `%${modelo}%`);

      const { data: encontrados } = await query.limit(5);
      const candidatos = (encontrados || []) as Record<string, unknown>[];

      if (candidatos.length > 1 && !imei) {
        const lista = candidatos
          .map((ap, i) => `${i + 1}. ${descreverAparelho(ap)}${ap.imei ? ` | IMEI ${ap.imei}` : ''}`)
          .join('\n');
        return (
          `❓ Tenho ${candidatos.length} aparelhos que batem com *${modelo}*:\n\n${lista}\n\n` +
          `Me diga o IMEI do que foi vendido.`
        );
      }

      const aparelho = candidatos[0];
      const custo = aparelho ? Number(aparelho.custo || 0) : 0;
      const lucro = Number((valor - custo).toFixed(2));
      const metodo = normalizarMetodo(texto(params, 'formaPagamento', 'metodo') || 'dinheiro');
      const tipoEntrega = texto(params, 'tipoEntrega') || 'Varejo';
      const descricaoItem = aparelho ? descreverAparelho(aparelho) : modelo;
      const agora = new Date().toISOString();

      const registro = {
        loja_id: ctx.lojaId,
        clienteNome: comprador,
        valor,
        custo,
        lucro,
        percentualLucro: custo > 0 ? Number(((lucro / custo) * 100).toFixed(2)) : 0,
        metodo,
        status: metodo === 'fiado' ? 'pendente' : 'pago',
        valorPago: metodo === 'fiado' ? 0 : valor,
        saldoDevedor: metodo === 'fiado' ? valor : 0,
        tipoEntrega,
        vendedor: ctx.pushName,
        dataPagamento: agora,
        descricao: `Venda ${tipoEntrega.toUpperCase()} - ${descricaoItem} para ${comprador}`,
        itens: [
          {
            id: Date.now().toString(),
            aparelhoId: aparelho?.id || undefined,
            descricao: descricaoItem,
            quantidade: 1,
            valorInterno: custo,
            valorExibir: valor,
            desconto: 0,
            tipoDesconto: 'R$',
            total: valor,
            observacao: aparelho?.imei ? `IMEI: ${aparelho.imei}` : '',
            imei: (aparelho?.imei as string) || imei || '',
          },
        ],
        ativo: true,
      };

      const { error } = await ctx.supabase.from('vendas').insert(registro);
      if (error) throw error;

      // Baixa do estoque só quando o aparelho foi identificado com segurança.
      if (aparelho?.id) {
        await ctx.supabase
          .from('aparelhos')
          .update({ ativo: false, condicao: 'vendido', status: 'vendido', cliente: comprador })
          .eq('id', aparelho.id as string)
          .eq('loja_id', ctx.lojaId);
      }

      return (
        `✅ *Venda registrada!*\n\n` +
        `📱 ${descricaoItem}\n` +
        `👤 ${comprador}\n` +
        `💰 ${moeda(valor)}${custo > 0 ? ` | Lucro: ${moeda(lucro)}` : ''}\n` +
        `💳 ${metodo.replace('_', ' ')} · ${tipoEntrega}\n` +
        (aparelho?.id ? '📦 Aparelho baixado do estoque.' : '⚠️ Aparelho não localizado no estoque; venda registrada sem baixa.')
      );
    },
  },

  {
    action: 'update_venda',
    titulo: 'Editar venda',
    descricao: 'Alterar valor ou custo de uma venda já registrada',
    recurso: 'vendas',
    papeis: ['owner'],
    escrita: true,
    parametros: [
      { nome: 'comprador', descricao: 'nome do comprador da venda' },
      { nome: 'modelo', descricao: 'modelo vendido' },
      { nome: 'novoValor', descricao: 'novo valor de venda' },
      { nome: 'novoCusto', descricao: 'novo custo' },
    ],
    exemplos: ['"altera a venda do Lucas para 2600" -> {"comprador":"Lucas","novoValor":2600}'],
    async executar(ctx, params) {
      const comprador = texto(params, 'comprador', 'cliente', 'clienteNome');
      const modelo = texto(params, 'modelo', 'aparelho');
      const novoValor = numero(params, 'novoValor', 'valor');
      const novoCusto = numero(params, 'novoCusto', 'custo');

      if (!comprador && !modelo) return '⚠️ De qual venda estamos falando? Me diga o comprador ou o aparelho.';
      if (novoValor <= 0 && novoCusto <= 0) return '⚠️ Qual o novo valor (ou custo) dessa venda?';

      let query = ctx.supabase
        .from('vendas')
        .select('id, clienteNome, valor, custo, descricao, dataPagamento')
        .eq('loja_id', ctx.lojaId);
      if (comprador) query = query.ilike('clienteNome', `%${comprador}%`);
      else query = query.ilike('descricao', `%${modelo}%`);

      const { data } = await query.order('dataPagamento', { ascending: false }).limit(1);
      const venda = (data || [])[0] as Record<string, unknown> | undefined;

      if (!venda) return `⚠️ Não encontrei venda recente para *${comprador || modelo}*.`;

      const valorFinal = novoValor > 0 ? novoValor : Number(venda.valor || 0);
      const custoFinal = novoCusto > 0 ? novoCusto : Number(venda.custo || 0);
      const lucro = Number((valorFinal - custoFinal).toFixed(2));

      const { error } = await ctx.supabase
        .from('vendas')
        .update({
          valor: valorFinal,
          custo: custoFinal,
          lucro,
          percentualLucro: custoFinal > 0 ? Number(((lucro / custoFinal) * 100).toFixed(2)) : 0,
        })
        .eq('id', venda.id as string)
        .eq('loja_id', ctx.lojaId);
      if (error) throw error;

      return (
        `✅ *Venda atualizada!*\n\n` +
        `👤 ${venda.clienteNome}\n` +
        `💰 Valor: ${moeda(Number(venda.valor || 0))} → *${moeda(valorFinal)}*\n` +
        `📉 Custo: ${moeda(Number(venda.custo || 0))} → *${moeda(custoFinal)}*\n` +
        `📈 Lucro: ${moeda(lucro)}`
      );
    },
  },

  {
    action: 'list_vendas',
    titulo: 'Listar vendas',
    descricao: 'Listar as vendas de um período ou de um cliente',
    recurso: 'vendas',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'periodo', descricao: 'hoje | ontem | semana | mes | ano' },
      { nome: 'cliente', descricao: 'filtrar por nome do comprador' },
    ],
    exemplos: ['"quais vendas de hoje?" -> {"periodo":"hoje"}', '"vendas do Lucas" -> {"cliente":"Lucas"}'],
    async executar(ctx, params) {
      const cliente = texto(params, 'cliente', 'comprador', 'clienteNome');
      const { inicio, fim, rotulo } = intervaloPeriodo(texto(params, 'periodo') || 'hoje');

      let query = ctx.supabase
        .from('vendas')
        .select('id, clienteNome, valor, lucro, metodo, status, dataPagamento, descricao')
        .eq('loja_id', ctx.lojaId);

      if (cliente) query = query.ilike('clienteNome', `%${cliente}%`);
      else query = query.gte('dataPagamento', inicio.toISOString()).lt('dataPagamento', fim.toISOString());

      const { data } = await query.order('dataPagamento', { ascending: false }).limit(20);
      const vendas = (data || []) as Record<string, unknown>[];

      if (vendas.length === 0) {
        return cliente ? `💰 Nenhuma venda encontrada para *${cliente}*.` : `💰 Nenhuma venda registrada ${rotulo}.`;
      }

      const total = vendas.reduce((soma, v) => soma + Number(v.valor || 0), 0);
      const linhas = vendas
        .map((v) => `• ${dataBr(v.dataPagamento as string)} — ${v.clienteNome} · ${moeda(Number(v.valor || 0))}`)
        .join('\n');

      return (
        `💰 *Vendas ${cliente ? `de ${cliente}` : rotulo}* (${vendas.length}):\n\n${linhas}\n\n` +
        `*Total:* ${moeda(total)}`
      );
    },
  },

  {
    action: 'resumo_financeiro',
    titulo: 'Resumo financeiro',
    descricao: 'Faturamento, lucro e ticket médio de um período',
    recurso: 'vendas',
    papeis: ['owner'],
    escrita: false,
    parametros: [{ nome: 'periodo', descricao: 'hoje | ontem | semana | mes | ano' }],
    exemplos: ['"qual o faturamento da semana?" -> {"periodo":"semana"}'],
    async executar(ctx, params) {
      const { inicio, fim, rotulo } = intervaloPeriodo(texto(params, 'periodo') || 'hoje');

      const { data } = await ctx.supabase
        .from('vendas')
        .select('valor, lucro, custo, metodo, status')
        .eq('loja_id', ctx.lojaId)
        .gte('dataPagamento', inicio.toISOString())
        .lt('dataPagamento', fim.toISOString());

      const vendas = (data || []) as Record<string, unknown>[];
      if (vendas.length === 0) return `📊 Nenhuma venda registrada ${rotulo}.`;

      const faturamento = vendas.reduce((s, v) => s + Number(v.valor || 0), 0);
      const lucro = vendas.reduce((s, v) => s + Number(v.lucro || 0), 0);
      const emAberto = vendas
        .filter((v) => v.status === 'pendente' || v.status === 'parcial')
        .reduce((s, v) => s + Number(v.valor || 0), 0);
      const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;

      return (
        `📊 *Resumo ${rotulo}*\n\n` +
        `🧾 Vendas: *${vendas.length}*\n` +
        `💰 Faturamento: *${moeda(faturamento)}*\n` +
        `📈 Lucro: *${moeda(lucro)}* (${margem.toFixed(1)}%)\n` +
        `🎯 Ticket médio: ${moeda(faturamento / vendas.length)}\n` +
        (emAberto > 0 ? `⏳ Em aberto: ${moeda(emAberto)}` : '✅ Tudo recebido')
      );
    },
  },

  {
    action: 'simular_parcelamento',
    titulo: 'Simular parcelamento',
    descricao: 'Calcular parcelas na maquininha usando as taxas cadastradas da loja',
    recurso: 'vendas',
    papeis: ['owner', 'staff'],
    escrita: false,
    parametros: [
      { nome: 'valor', descricao: 'valor do produto', obrigatorio: true },
      { nome: 'parcelas', descricao: 'número de parcelas desejado' },
    ],
    exemplos: ['"quanto fica 3000 em 10x?" -> {"valor":3000,"parcelas":10}'],
    async executar(ctx, params) {
      const valor = numero(params, 'valor', 'preco');
      if (valor <= 0) return '⚠️ Qual valor devo simular?';

      const parcelasPedidas = Math.trunc(numero(params, 'parcelas', 'vezes'));

      const { data } = await ctx.supabase
        .from('taxas_maquininha')
        .select('*')
        .eq('loja_id', ctx.lojaId)
        .eq('ativo', true)
        .limit(30);

      const taxas = (data || []) as Record<string, unknown>[];
      if (taxas.length === 0) {
        return (
          '⚠️ Nenhuma taxa de maquininha cadastrada ainda.\n' +
          'Cadastre em *Calculadora de Taxa* no painel para eu conseguir simular.'
        );
      }

      /** Repassa a taxa ao cliente: o lojista recebe líquido o valor cheio. */
      const comTaxa = (base: number, taxaPercent: number) =>
        taxaPercent >= 100 ? base : base / (1 - taxaPercent / 100);

      const linhaDe = (t: Record<string, unknown>) => {
        const n = Math.trunc(Number(t.parcelas ?? t.parcela ?? 0));
        const taxa = Number(t.taxaBaseMaster ?? t.taxa ?? t.taxa_master ?? 0);
        if (!n || n < 1) return null;
        const total = comTaxa(valor, taxa);
        return { n, total, parcela: total / n };
      };

      const linhas = taxas
        .map(linhaDe)
        .filter((l): l is { n: number; total: number; parcela: number } => l !== null)
        .sort((a, b) => a.n - b.n);

      if (linhas.length === 0) return '⚠️ As taxas cadastradas estão incompletas. Revise em *Calculadora de Taxa*.';

      const escolhidas = parcelasPedidas > 0 ? linhas.filter((l) => l.n === parcelasPedidas) : linhas;
      if (escolhidas.length === 0) {
        return `⚠️ Não há taxa cadastrada para ${parcelasPedidas}x. Opções: ${linhas.map((l) => `${l.n}x`).join(', ')}.`;
      }

      const corpo = escolhidas
        .map((l) => `• *${l.n}x* de ${moeda(l.parcela)} — total ${moeda(l.total)}`)
        .join('\n');

      return `💳 *Parcelamento para ${moeda(valor)}*\n\n${corpo}`;
    },
  },
];
