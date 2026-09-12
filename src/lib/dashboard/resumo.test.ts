import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertaCapitalParado,
  calcularTotaisVendas,
  diaNoFusoDaLoja,
  dividirPorFormaPagamento,
  filtrarOsDoPeriodo,
  formatarReais,
  listarDias,
  mensagemErroResumo,
  montarGraficoDiario,
  normalizarResumoDashboard,
  rotuloFormaPagamento,
  somarOsPorDia,
  vendaEntraNoResumo,
} from './resumo';

describe('Dia da venda no fuso da loja', () => {
  it('usa São Paulo, não UTC', () => {
    // 22h de 10/09 em São Paulo é 01h de 11/09 em UTC.
    assert.equal(diaNoFusoDaLoja('2026-09-11T01:00:00Z'), '2026-09-10');
    assert.equal(diaNoFusoDaLoja('2026-09-10T15:00:00+00:00'), '2026-09-10');
    // Antigo meio-dia fixo de calendário continua no mesmo dia.
    assert.equal(diaNoFusoDaLoja('2026-08-01T12:00:00Z'), '2026-08-01');
  });

  it('sem data ou data inválida não vira hoje', () => {
    assert.equal(diaNoFusoDaLoja(null), null);
    assert.equal(diaNoFusoDaLoja(undefined), null);
    assert.equal(diaNoFusoDaLoja(''), null);
    assert.equal(diaNoFusoDaLoja('ontem'), null);
  });
});

describe('Vendas que entram no resumo', () => {
  it('cancelada, estornada e sem data ficam de fora', () => {
    assert.equal(vendaEntraNoResumo({ status: 'pago', dataPagamento: '2026-09-05T15:00:00Z' }, '2026-09-01', '2026-09-30'), true);
    assert.equal(vendaEntraNoResumo({ status: 'cancelado', dataPagamento: '2026-09-05T15:00:00Z' }, '2026-09-01', '2026-09-30'), false);
    assert.equal(vendaEntraNoResumo({ status: 'Estornada', dataPagamento: '2026-09-05T15:00:00Z' }, '2026-09-01', '2026-09-30'), false);
    assert.equal(vendaEntraNoResumo({ status: 'pago', dataPagamento: null }, '2026-09-01', '2026-09-30'), false);
  });

  it('limites do período são inclusivos e aceitam início e fim trocados', () => {
    const venda = { status: 'pago', dataPagamento: '2026-10-01T02:30:00Z' }; // 30/09 23h30 em SP
    assert.equal(vendaEntraNoResumo(venda, '2026-09-01', '2026-09-30'), true);
    assert.equal(vendaEntraNoResumo(venda, '2026-09-30', '2026-09-01'), true);
    assert.equal(vendaEntraNoResumo(venda, '2026-10-01', '2026-10-31'), false);
  });

  it('totais descontam a taxa do cartão e calculam ticket médio', () => {
    const totais = calcularTotaisVendas(
      [
        { status: 'pago', dataPagamento: '2026-09-02T15:00:00Z', valor: 4400, custo: 4000, lucro: 400, taxa_cartao: 120.5 },
        { status: 'pendente', dataPagamento: '2026-09-03T15:00:00Z', valor: '1000', custo: '700', lucro: null },
        { status: 'cancelado', dataPagamento: '2026-09-03T15:00:00Z', valor: 9999, custo: 0, lucro: 9999 },
        { status: 'pago', dataPagamento: null, valor: 5000, custo: 0, lucro: 5000 },
      ],
      '2026-09-01',
      '2026-09-30'
    );
    assert.deepEqual(totais, {
      quantidade: 2,
      faturamento: 5400,
      custo: 4700,
      lucroBruto: 700,
      taxas: 120.5,
      lucroLiquido: 579.5,
      ticketMedio: 2700,
    });
  });

  it('período sem venda devolve zeros sem dividir por zero', () => {
    assert.equal(calcularTotaisVendas([], '2026-09-01', '2026-09-30').ticketMedio, 0);
  });
});

describe('Forma de pagamento', () => {
  it('um pagamento só ou lista vazia usa o método da venda', () => {
    assert.deepEqual(dividirPorFormaPagamento({ valor: 300, metodo: 'pix', pagamentos: [] }), [{ forma: 'pix', valor: 300 }]);
    assert.deepEqual(dividirPorFormaPagamento({ valor: 300, metodo: null, pagamentos: null }), [{ forma: 'nao_informado', valor: 300 }]);
  });

  it('vários pagamentos dividem o valor da venda na proporção', () => {
    // Soma dos pagamentos (500) diferente do valor (1000): a proporção mantém o total da venda.
    const partes = dividirPorFormaPagamento({
      valor: 1000,
      metodo: 'pix',
      pagamentos: [
        { metodo: 'dinheiro', valor: 100 },
        { metodo: 'cartao_credito', valor: 400 },
        { metodo: 'pix', valor: 0 },
      ],
    });
    assert.deepEqual(partes, [
      { forma: 'dinheiro', valor: 200 },
      { forma: 'cartao_credito', valor: 800 },
    ]);
  });

  it('pagamento sem método herda o da venda; valor em texto brasileiro é ignorado', () => {
    assert.deepEqual(
      dividirPorFormaPagamento({ valor: 50, metodo: 'fiado', pagamentos: [{ valor: 50 }, { metodo: 'pix', valor: '1.750,00' }] }),
      [{ forma: 'fiado', valor: 50 }]
    );
  });

  it('rótulos amigáveis', () => {
    assert.equal(rotuloFormaPagamento('cartao_credito'), 'Cartão de crédito');
    assert.equal(rotuloFormaPagamento('nao_informado'), 'Não informado');
    assert.equal(rotuloFormaPagamento('link_pagamento'), 'Link pagamento');
  });
});

describe('Capital parado', () => {
  it('alerta só acima do limite de dias', () => {
    assert.equal(alertaCapitalParado(60), false);
    assert.equal(alertaCapitalParado(61), true);
    assert.equal(alertaCapitalParado(null), false);
    assert.equal(alertaCapitalParado(31, 30), true);
  });
});

describe('Resposta da RPC', () => {
  it('converte números, datas e grupos com alerta', () => {
    const resumo = normalizarResumoDashboard({
      inicio: '2026-09-01',
      fim: '2026-09-30',
      limite_dias_parado: 60,
      totais: { quantidade: 2, faturamento: '5400.00', custo: 4700, lucro_bruto: 700, taxas: 120.5, lucro_liquido: 579.5, ticket_medio: 2700 },
      por_dia: [{ dia: '2026-09-02', quantidade: 1, faturamento: 4400, lucro_bruto: 400, taxas: 120.5, lucro_liquido: 279.5 }, { dia: null }],
      por_forma_pagamento: [{ forma: 'pix', quantidade: 1, valor: 4400 }],
      capital_parado: {
        quantidade: 3,
        custo_parado: '9100.50',
        acima_limite: 1,
        grupos: [
          { modelo: 'iPhone 13', capacidade: '128GB', quantidade: 2, custo_parado: 6000, sem_custo: 0, dias_mais_antigo: 75, dias_medio: 40, acima_limite: 1 },
          { modelo: '', capacidade: null, quantidade: 1, custo_parado: 3100.5, sem_custo: 1, dias_mais_antigo: null, dias_medio: null, acima_limite: 0 },
        ],
      },
    });

    assert.equal(resumo.totais.faturamento, 5400);
    assert.equal(resumo.porDia.length, 1);
    assert.equal(resumo.porFormaPagamento[0].rotulo, 'Pix');
    assert.equal(resumo.capitalParado.custoParado, 9100.5);
    assert.equal(resumo.capitalParado.grupos[0].alerta, true);
    assert.equal(resumo.capitalParado.grupos[1].modelo, 'Sem modelo');
    assert.equal(resumo.capitalParado.grupos[1].diasMaisAntigo, null);
    assert.equal(resumo.capitalParado.grupos[1].alerta, false);
  });

  it('resposta vazia ou estranha não quebra a tela', () => {
    const resumo = normalizarResumoDashboard(null);
    assert.equal(resumo.totais.quantidade, 0);
    assert.deepEqual(resumo.porDia, []);
    assert.equal(resumo.capitalParado.limiteDias, 60);
  });

  it('explica quando a função não existe no banco', () => {
    assert.match(mensagemErroResumo({ code: 'PGRST202', message: 'Could not find the function' }), /migration/);
    assert.match(mensagemErroResumo(new Error('rede')), /Não foi possível/);
  });
});

describe('Gráfico diário', () => {
  it('lista todos os dias do período, em ordem de data e não de texto', () => {
    assert.deepEqual(listarDias('2026-08-30', '2026-09-02'), ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']);
    assert.deepEqual(listarDias('2026-09-02', '2026-08-30').length, 4);
    assert.deepEqual(listarDias('2020-01-01', '2026-01-01'), []);
    assert.deepEqual(listarDias('', '2026-01-01'), []);
  });

  it('junta vendas e OS por dia com zeros nos dias vazios', () => {
    const ordens = [
      { dataEntrada: '2026-09-01T13:00:00Z', status: 'entregue', precoVenda: 250, lucro: 150 },
      { dataEntrada: '2026-09-01T14:00:00Z', status: 'em_andamento', precoVenda: 999, lucro: 999 },
      { dataEntrada: null, status: 'entregue', precoVenda: 500, lucro: 500 },
    ];
    const pontos = montarGraficoDiario(
      '2026-08-31',
      '2026-09-01',
      [{ dia: '2026-08-31', quantidade: 1, faturamento: 1000, custo: 800, lucroBruto: 200, taxas: 20, lucroLiquido: 180 }],
      somarOsPorDia(ordens)
    );
    assert.deepEqual(pontos, [
      { dia: '2026-08-31', rotulo: '31/08', receitaVendas: 1000, lucroVendas: 180, receitaOS: 0, lucroOS: 0 },
      { dia: '2026-09-01', rotulo: '01/09', receitaVendas: 0, lucroVendas: 0, receitaOS: 250, lucroOS: 150 },
    ]);
  });

  it('OS sem data de entrada não entra no período', () => {
    const ordens = [{ dataEntrada: '2026-09-05T15:00:00Z' }, { dataEntrada: null }, { dataEntrada: 'x' }];
    assert.equal(filtrarOsDoPeriodo(ordens, '2026-09-01', '2026-09-30').length, 1);
  });

  it('formata reais no padrão brasileiro', () => {
    assert.equal(formatarReais(1750.5), 'R$ 1.750,50');
    assert.equal(formatarReais(Number.NaN), 'R$ 0,00');
  });
});
