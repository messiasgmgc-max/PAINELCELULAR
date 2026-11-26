import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparSaidasPorDia,
  calcularResumoSaidas,
  construirHistoricoSaidas,
  corVisualSwatch,
  filtrarEOrdenarSaidas,
  montarResumoTextoSaida,
} from './historicoSaidas';

function aparelhoBase(extra: Record<string, any> = {}) {
  return {
    id: 'ap-1',
    marca: 'Apple',
    modelo: 'iPhone 15 Pro Max',
    capacidade: '256GB',
    cor: 'Titânio Natural',
    saude_bateria: '92%',
    imei: '353812345678901',
    condicao: 'seminovo',
    status: 'vendido',
    ativo: false,
    preco: 5800,
    custo: 4900,
    cliente: 'João Silva',
    dataCadastro: '2026-11-15T10:00:00.000Z',
    data_saida: '2026-11-25T14:30:00.000Z',
    motivo_saida: 'venda',
    observacoes:
      'BAIXA_ESTOQUE:2026-11-25T14:30:00.000Z:Venda VAREJO para João Silva por R$ 5800.00 | Custo: R$ 4900.00 | Lucro: R$ 900.00 | Pgto: pix | Obs: Entregue com cabo original | ID: 12345678 | IMEI: 353812345678901',
    ...extra,
  };
}

describe('construirHistoricoSaidas', () => {
  it('ignora aparelhos no estoque e aparelhos de cliente da OS', () => {
    const lista = [
      aparelhoBase({ id: 'em-estoque', ativo: true, status: 'disponivel', condicao: 'seminovo' }),
      aparelhoBase({ id: 'cliente-os', ativo: false, status: 'cliente', condicao: 'usado' }),
      aparelhoBase({ id: 'vendido-1', ativo: false, status: 'vendido' }),
    ];

    const saidas = construirHistoricoSaidas(lista);
    assert.equal(saidas.length, 1);
    assert.equal(saidas[0].id, 'vendido-1');
  });

  it('extrai campos estruturados e limpa o bloco técnico das observações', () => {
    const [saida] = construirHistoricoSaidas([aparelhoBase()]);

    assert.equal(saida.tituloModelo, 'iPhone 15 Pro Max');
    assert.equal(saida.capacidade, '256GB');
    assert.equal(saida.cor, 'Titânio Natural');
    assert.equal(saida.corSwatch, '#a8a29e');
    assert.equal(saida.bateriaTexto, '92%');
    assert.equal(saida.bateriaPct, 92);
    assert.equal(saida.nivelBateria, 'otima');
    assert.equal(saida.imei, '353812345678901');
    assert.equal(saida.tipoSaida, 'varejo');
    assert.equal(saida.comprador, 'João Silva');
    assert.equal(saida.formaPagamento, 'PIX');
    assert.equal(saida.valorSaida, 5800);
    assert.equal(saida.custo, 4900);
    assert.equal(saida.lucro, 900);
    assert.equal(saida.motivoLegivel, 'Venda no Varejo');
    assert.equal(saida.observacaoLimpa, 'Entregue com cabo original');
    assert.equal(saida.diasEmEstoque, 10);
    assert.equal(saida.temHorarioSaida, true);
  });

  it('classifica corretamente vendas de atacado e baixas manuais', () => {
    const lista = [
      aparelhoBase({
        id: 'atacado-1',
        cliente: '',
        preco: 4500,
        precoAtacado: 4200,
        observacoes:
          'BAIXA_ESTOQUE:2026-11-24T11:00:00.000Z:Venda ATACADO para Loja Central por R$ 4200.00 | Pgto: fiado',
      }),
      aparelhoBase({
        id: 'baixa-1',
        status: 'baixado',
        motivo_saida: 'conferencia',
        cliente: '',
        condicao: 'seminovo',
        observacoes: 'BAIXA_ESTOQUE:2026-11-23T09:00:00.000Z:Baixa automática na conferência',
      }),
    ];

    const saidas = construirHistoricoSaidas(lista);
    assert.equal(saidas[0].tipoSaida, 'atacado');
    assert.equal(saidas[0].comprador, 'Loja Central');
    assert.equal(saidas[0].formaPagamento, 'A Prazo / Fiado');
    assert.equal(saidas[0].valorSaida, 4200);

    assert.equal(saidas[1].tipoSaida, 'outro');
    assert.equal(saidas[1].motivoLegivel, 'Baixa na conferência');
    assert.equal(saidas[1].valorSaida, null);
  });

  it('usa a data de BAIXA_ESTOQUE quando editada e cai em data_saida quando não há tag', () => {
    const [editado, semTag] = construirHistoricoSaidas([
      aparelhoBase({
        id: 'editado',
        data_saida: '2026-11-20T10:00:00.000Z',
        observacoes: 'BAIXA_ESTOQUE:2026-11-25T18:45:00.000Z:Venda VAREJO para Maria por R$ 5000.00',
      }),
      aparelhoBase({
        id: 'sem-tag',
        status: 'baixado',
        motivo_saida: 'baixa_massa',
        data_saida: '2026-11-22T15:00:00.000Z',
        observacoes: '',
      }),
    ]);

    assert.equal(editado.dataSaida, '2026-11-25T18:45:00.000Z');
    assert.equal(semTag.dataSaida, '2026-11-22T15:00:00.000Z');
    assert.equal(semTag.motivoLegivel, 'Baixa em massa');
  });

  it('omite condição física quando legado grava "vendido" em condicao', () => {
    const [saida] = construirHistoricoSaidas([aparelhoBase({ condicao: 'vendido' })]);
    assert.equal(saida.condicaoFisica, '');
  });
});

describe('filtrarEOrdenarSaidas', () => {
  const agora = new Date(2026, 10, 26, 16, 0, 0); // 26/11/2026 16:00 local

  const base = construirHistoricoSaidas([
    aparelhoBase({
      id: 'hoje-15pm',
      modelo: 'iPhone 15 Pro Max',
      cor: 'Blue Titanium',
      capacidade: '256GB',
      saude_bateria: '95%',
      imei: '351111111111111',
      cliente: 'Carlos Andrade',
      data_saida: new Date(2026, 10, 26, 14, 0, 0).toISOString(),
      observacoes: `BAIXA_ESTOQUE:${new Date(2026, 10, 26, 14, 0, 0).toISOString()}:Venda VAREJO para Carlos Andrade por R$ 6200.00 | Pgto: pix`,
    }),
    aparelhoBase({
      id: 'ontem-15p',
      modelo: 'iPhone 15 Pro',
      cor: 'Preto',
      capacidade: '128GB',
      saude_bateria: '88%',
      imei: '352222222222222',
      cliente: 'Loja Parceira',
      data_saida: new Date(2026, 10, 25, 11, 0, 0).toISOString(),
      observacoes: `BAIXA_ESTOQUE:${new Date(2026, 10, 25, 11, 0, 0).toISOString()}:Venda ATACADO para Loja Parceira por R$ 4700.00 | Pgto: fiado`,
    }),
    aparelhoBase({
      id: 'antigo-13',
      modelo: 'iPhone 13',
      cor: 'Branco',
      capacidade: '128GB',
      saude_bateria: '81%',
      imei: '353333333333333',
      status: 'baixado',
      motivo_saida: 'baixa_manual',
      cliente: '',
      data_saida: new Date(2026, 9, 10, 10, 0, 0).toISOString(),
      observacoes: '',
    }),
    aparelhoBase({
      id: 'sem-data',
      modelo: 'iPhone 12',
      cor: 'Roxo',
      capacidade: '64GB',
      saude_bateria: '79%',
      imei: '354444444444444',
      data_saida: null,
      observacoes: '',
    }),
  ]);

  it('ordena por ordem de saída recente e antiga mantendo sem-data no final', () => {
    const recentes = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(
      recentes.map((x) => x.id),
      ['hoje-15pm', 'ontem-15p', 'antigo-13', 'sem-data']
    );

    const antigas = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '',
      ordenacao: 'saida_antiga',
      agora,
    });
    assert.deepEqual(
      antigas.map((x) => x.id),
      ['antigo-13', 'ontem-15p', 'hoje-15pm', 'sem-data']
    );
  });

  it('suporta busca inteligente por atalho (15pm), sinônimo de cor, bateria e diferencia 15 pro de 15 pro max', () => {
    const buscaAtalhoCor = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '15pm azul 95%',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(buscaAtalhoCor.map((x) => x.id), ['hoje-15pm']);

    const busca15Pro = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '15p',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(busca15Pro.map((x) => x.id), ['ontem-15p']);

    const buscaImeiFinal = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '33333',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(buscaImeiFinal.map((x) => x.id), ['antigo-13']);
  });

  it('filtra por período (hoje, 7d, mes_atual, personalizado)', () => {
    const hoje = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'hoje',
      busca: '',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(hoje.map((x) => x.id), ['hoje-15pm']);

    const seteDias = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: '7d',
      busca: '',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(seteDias.map((x) => x.id), ['hoje-15pm', 'ontem-15p']);

    const personalizado = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'personalizado',
      dataInicio: '2026-10-01',
      dataFim: '2026-10-31',
      busca: '',
      ordenacao: 'saida_recente',
      agora,
    });
    assert.deepEqual(personalizado.map((x) => x.id), ['antigo-13']);
  });

  it('agrupa corretamente por dia com rótulos Hoje, Ontem e Sem data', () => {
    const ordenadas = filtrarEOrdenarSaidas(base, {
      tipo: 'todos',
      periodo: 'todos',
      busca: '',
      ordenacao: 'saida_recente',
      agora,
    });
    const grupos = agruparSaidasPorDia(ordenadas, agora);
    assert.equal(grupos.length, 4);
    assert.equal(grupos[0].rotulo, 'Hoje');
    assert.equal(grupos[1].rotulo, 'Ontem');
    assert.equal(grupos[3].chave, 'sem-data');
  });

  it('calcula resumo consolidado e formata texto para copiar', () => {
    const resumo = calcularResumoSaidas(base);
    assert.equal(resumo.total, 4);
    assert.equal(resumo.varejo, 2);
    assert.equal(resumo.atacado, 1);
    assert.equal(resumo.outro, 1);

    const texto = montarResumoTextoSaida(base[0]);
    assert.match(texto, /iPhone 15 Pro Max 256GB/);
    assert.match(texto, /IMEI: 351111111111111/);
    assert.match(texto, /Bateria: 95%/);
    assert.match(texto, /Cor: Blue Titanium/);
    assert.match(texto, /Destino: Carlos Andrade/);
  });

  it('retorna swatch de cor para cores comuns', () => {
    assert.equal(corVisualSwatch('Titânio Deserto'), '#d4b185');
    assert.equal(corVisualSwatch('Azul Ultramarino'), '#3b82f6');
    assert.equal(corVisualSwatch(''), null);
  });
});
