import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAparelhoCodigo, formatarSaudeBateria } from '@/lib/utils';
import { estaNoEstoque } from '@/lib/estoque/ciclo';

describe('Resiliência a dados incompletos ou nulos de Aparelhos no Estoque', () => {
  it('deve extrair código do aparelho mesmo com campos nulos ou incompletos', () => {
    const ap1 = { id: '12345678-abcd', modelo: 'iPhone 15' };
    assert.equal(getAparelhoCodigo(ap1), '12345678');

    const ap2 = { id: '999', codigo: '123456', modelo: 'iPhone 13' };
    assert.equal(getAparelhoCodigo(ap2), '00123456');

    const ap3 = null;
    assert.equal(getAparelhoCodigo(ap3), '');
  });

  it('deve formatar saúde de bateria sem quebrar com dados nulos, strings ou formatos variados', () => {
    assert.equal(formatarSaudeBateria({ saudeBateria: '88%' }), '88%');
    assert.equal(formatarSaudeBateria({ saude_bateria: '100' }), '100%');
    assert.equal(formatarSaudeBateria({ bateria: null }), '');
    assert.equal(formatarSaudeBateria(null), '');
    assert.equal(formatarSaudeBateria({ saudeBateria: '0' }), '');
    assert.equal(formatarSaudeBateria({ saudeBateria: '150' }), '');
  });

  it('deve verificar situação de estoque mesmo se preco, condicao ou status forem nulos', () => {
    const apSemPreco = { id: 'ap-1', ativo: true, status: 'disponivel', condicao: null, preco: null };
    assert.equal(estaNoEstoque(apSemPreco as any), true);

    const apVendido = { id: 'ap-2', ativo: false, status: 'vendido', preco: null };
    assert.equal(estaNoEstoque(apVendido as any), false);
  });
});
