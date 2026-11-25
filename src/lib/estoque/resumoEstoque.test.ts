import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Aparelho } from '@/lib/db/types';
import {
  agruparAparelhosPorModelo,
  aplicarFiltroRapidoEstoque,
  calcularDiasEmEstoque,
  calcularResumoEstoque,
  classificarBateria,
  montarTextoCompartilharAparelho,
  obterPercentualBateria,
  ordenarAparelhosEstoque,
} from './resumoEstoque';

function criarAparelho(overrides: Partial<Aparelho> = {}): Aparelho {
  return {
    id: 'ap-1',
    categoria: 'aparelho',
    marca: 'Apple',
    modelo: 'iPhone 16 Pro Max',
    capacidade: '256GB',
    cor: 'Branco',
    condicao: 'seminovo',
    preco: 6500,
    custo: 5500,
    precoAtacado: 6000,
    saude_bateria: '92%',
    quantidade: 1,
    dataCadastro: '2026-11-20T10:00:00Z',
    ativo: true,
    lojaId: 'loja-1',
    ...overrides,
  };
}

describe('resumo e classificadores de estoque', () => {
  const agora = new Date('2026-11-25T12:00:00Z');

  it('exclui acessórios da contagem e do valor dos aparelhos por padrão (mesmo com milhares de unidades)', () => {
    const lista: Aparelho[] = [
      criarAparelho({
        id: '1',
        modelo: 'iPhone 16 Pro Max',
        condicao: 'novo',
        preco: 7200,
        custo: 6200,
        precoAtacado: 6700,
        saude_bateria: '100%',
        dataCadastro: '2026-11-22T10:00:00Z',
      }),
      criarAparelho({
        id: '2',
        modelo: 'iPhone 16 Pro Max',
        condicao: 'seminovo',
        preco: 0,
        custo: 4800,
        precoAtacado: 5300,
        saude_bateria: '87%',
        dataCadastro: '2026-10-01T10:00:00Z', // > 30 dias
      }),
      criarAparelho({
        id: '3',
        categoria: 'acessorio',
        marca: 'Apple',
        modelo: 'Cabo USB-C',
        condicao: 'novo',
        preco: 120,
        custo: 40,
        precoAtacado: 80,
        quantidade: 5000,
        saude_bateria: '',
        dataCadastro: '2026-11-24T10:00:00Z',
      }),
    ];

    // Padrão: acessórios ficam fora da contagem e do valor dos aparelhos
    const resumo = calcularResumoEstoque(lista, agora);
    assert.equal(resumo.totalRegistros, 2);
    assert.equal(resumo.totalUnidades, 2);
    assert.equal(resumo.totalAcessoriosTipos, 1);
    assert.equal(resumo.modelosUnicos, 1);
    assert.equal(resumo.novos, 1);
    assert.equal(resumo.seminovos, 1);
    assert.equal(resumo.semPreco, 1);
    assert.equal(resumo.bateriaAlta, 1);
    assert.equal(resumo.parados30d, 1);
    assert.equal(resumo.valorTotalVenda, 7200);
    assert.equal(resumo.valorTotalCusto, 6200 + 4800);
    assert.equal(resumo.valorTotalAtacado, 6700 + 5300);

    // Quando o usuário entra na aba de Acessórios, pode incluir acessórios explicitamente
    const resumoComAcessorios = calcularResumoEstoque(lista, agora, {
      excluirAcessorios: false,
    });
    assert.equal(resumoComAcessorios.totalRegistros, 3);
    assert.equal(resumoComAcessorios.totalUnidades, 5002);
    assert.equal(resumoComAcessorios.totalAcessoriosTipos, 1);
  });

  it('classifica níveis de bateria e dias em estoque', () => {
    assert.equal(obterPercentualBateria(criarAparelho({ saude_bateria: '95%' })), 95);
    assert.equal(classificarBateria(95), 'otima');
    assert.equal(classificarBateria(85), 'boa');
    assert.equal(classificarBateria(76), 'atencao');
    assert.equal(classificarBateria(null), null);

    assert.equal(
      calcularDiasEmEstoque(criarAparelho({ dataCadastro: '2026-11-20T12:00:00Z' }), agora),
      5
    );
  });
});

describe('filtros rápidos, ordenação e agrupamento por modelo', () => {
  const agora = new Date('2026-11-25T12:00:00Z');
  const itens: Aparelho[] = [
    criarAparelho({
      id: 'a',
      modelo: 'iPhone 15 Pro',
      capacidade: '128GB',
      condicao: 'seminovo',
      preco: 0,
      saude_bateria: '80%',
      dataCadastro: '2026-10-10T10:00:00Z',
    }),
    criarAparelho({
      id: 'b',
      modelo: 'iPhone 16 Pro Max',
      capacidade: '256GB',
      condicao: 'novo',
      preco: 7500,
      saude_bateria: '100%',
      dataCadastro: '2026-11-24T10:00:00Z',
    }),
    criarAparelho({
      id: 'c',
      modelo: 'iPhone 16 Pro Max',
      capacidade: '512GB',
      condicao: 'seminovo',
      preco: 6800,
      saude_bateria: '93%',
      dataCadastro: '2026-11-18T10:00:00Z',
    }),
  ];

  it('aplica filtros rápidos corretamente', () => {
    assert.deepEqual(
      aplicarFiltroRapidoEstoque(itens, 'sem_preco', agora).map((i) => i.id),
      ['a']
    );
    assert.deepEqual(
      aplicarFiltroRapidoEstoque(itens, 'novos', agora).map((i) => i.id),
      ['b']
    );
    assert.deepEqual(
      aplicarFiltroRapidoEstoque(itens, 'bateria_alta', agora).map((i) => i.id),
      ['b', 'c']
    );
    assert.deepEqual(
      aplicarFiltroRapidoEstoque(itens, 'parados_30d', agora).map((i) => i.id),
      ['a']
    );
  });

  it('ordena colocando sem preço no fim ao escolher menor preço', () => {
    assert.deepEqual(
      ordenarAparelhosEstoque(itens, 'menor_preco').map((i) => i.id),
      ['c', 'b', 'a']
    );
    assert.deepEqual(
      ordenarAparelhosEstoque(itens, 'maior_bateria').map((i) => i.id),
      ['b', 'c', 'a']
    );
    assert.deepEqual(
      ordenarAparelhosEstoque(itens, 'mais_antigos').map((i) => i.id),
      ['a', 'c', 'b']
    );
  });

  it('agrupa aparelhos por modelo com faixa de preço e capacidades', () => {
    const grupos = agruparAparelhosPorModelo(itens);
    assert.equal(grupos.length, 2);

    const g16 = grupos.find((g) => g.titulo === 'iPhone 16 Pro Max');
    assert.ok(g16);
    assert.equal(g16.totalUnidades, 2);
    assert.equal(g16.menorPreco, 6800);
    assert.equal(g16.maiorPreco, 7500);
    assert.deepEqual(g16.capacidades, ['256GB', '512GB']);
    assert.equal(g16.semPrecoCount, 0);

    const g15 = grupos.find((g) => g.titulo === 'iPhone 15 Pro');
    assert.ok(g15);
    assert.equal(g15.menorPreco, null);
    assert.equal(g15.semPrecoCount, 1);
  });

  it('gera texto pronto para compartilhar no WhatsApp', () => {
    const texto = montarTextoCompartilharAparelho(itens[1]);
    assert.ok(texto.includes('*iPhone 16 Pro Max*'));
    assert.ok(texto.includes('256GB'));
    assert.ok(texto.includes('Bateria 100%'));
    assert.ok(texto.includes('7.500,00'));
  });
});
