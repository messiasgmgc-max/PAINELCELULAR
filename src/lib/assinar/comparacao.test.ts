import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLANOS_SISTEMA } from '@/lib/planos-config';
import {
  DATA_CONSULTA_MERCADOPHONE,
  PLANOS_MERCADOPHONE,
  RECURSOS_COMPARADOS,
  economiaDoPeriodo,
  formatarPreco,
  mesesDoPeriodo,
  planoMercadoPhoneMaisBaratoCom,
  resumoComparacao,
} from './comparacao';

describe('Comparação com o MercadoPhone e ancoragem', () => {
  it('usa os preços públicos consultados em 10/09/2026', () => {
    assert.equal(DATA_CONSULTA_MERCADOPHONE, '2026-09-10');
    assert.deepEqual(
      PLANOS_MERCADOPHONE.map((p) => [p.nome, p.precoMensal]),
      [
        ['Plus', 129.99],
        ['Pro', 219.99],
        ['Pro Max', 399.99],
      ]
    );
  });

  it('OS, nota fiscal, app e etiquetas: Pro no MercadoPhone; nada disso no Plus', () => {
    assert.equal(planoMercadoPhoneMaisBaratoCom(['os', 'nota_fiscal', 'app', 'etiquetas'])?.id, 'pro');
    assert.equal(PLANOS_MERCADOPHONE[0].inclui.length, 0);
    assert.equal(planoMercadoPhoneMaisBaratoCom(['mais_de_um_usuario']), null);
  });

  it('resumo: Entrada x Pro, diferença calculada dos preços reais', () => {
    const r = resumoComparacao();
    assert.equal(r.phoneCenter.plano, 'entrada');
    assert.equal(r.phoneCenter.precoMensal, PLANOS_SISTEMA.entrada.precos.mensal.valorMensal);
    assert.equal(r.mercadoPhone.id, 'pro');
    assert.equal(r.diferencaMensal, 120.09);
    assert.equal(r.diferencaAnual, 1441.08);
  });

  it('todos os recursos comparados existem no plano Entrada do Phone Center', () => {
    for (const r of RECURSOS_COMPARADOS) assert.equal(r.plano, 'entrada', r.recurso);
  });

  it('anual e trimestral economizam frente ao mensal, conforme planos-config', () => {
    assert.equal(mesesDoPeriodo('anual'), 12);
    assert.equal(mesesDoPeriodo('trimestral'), 3);
    assert.equal(economiaDoPeriodo('entrada', 'mensal'), 0);
    assert.equal(economiaDoPeriodo('entrada', 'anual'), 240);
    assert.equal(economiaDoPeriodo('entrada', 'trimestral'), 30);
    assert.equal(economiaDoPeriodo('intermediario', 'anual'), 480);
    assert.equal(economiaDoPeriodo('avancado', 'anual'), 720);
  });

  it('formata preço com vírgula', () => {
    assert.equal(formatarPreco(219.99), '219,99');
    assert.equal(formatarPreco(1441.08), '1.441,08');
  });
});
