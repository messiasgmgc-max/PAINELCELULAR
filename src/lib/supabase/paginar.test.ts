import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buscarTodasPaginas } from './paginar';

function tabela(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const pedidos: Array<[number, number]> = [];
  const consultar = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return { data: linhas.slice(de, ate + 1), error: null };
  };
  return { consultar, pedidos };
}

describe('Busca paginada', () => {
  it('traz tudo além de uma página', async () => {
    const { consultar, pedidos } = tabela(2500);
    const todas = await buscarTodasPaginas(consultar, 1000);
    assert.equal(todas.length, 2500);
    assert.deepEqual(pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('para quando a última página vem vazia', async () => {
    const { consultar, pedidos } = tabela(2000);
    assert.equal((await buscarTodasPaginas(consultar, 1000)).length, 2000);
    assert.equal(pedidos.length, 3);
  });

  it('tabela vazia faz uma requisição só', async () => {
    const { consultar, pedidos } = tabela(0);
    assert.deepEqual(await buscarTodasPaginas(consultar), []);
    assert.equal(pedidos.length, 1);
  });

  it('erro na consulta interrompe em vez de devolver lista parcial', async () => {
    let chamadas = 0;
    await assert.rejects(
      buscarTodasPaginas(async () => {
        chamadas += 1;
        return chamadas === 1
          ? { data: Array(10).fill({}), error: null }
          : { data: null, error: new Error('falhou') };
      }, 10),
      /falhou/
    );
  });
});
