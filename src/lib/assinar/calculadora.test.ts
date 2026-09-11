import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PADRAO_CALCULADORA,
  anguloDoMedidor,
  calcularPrejuizo,
  escalaDasBarras,
  formatarReais,
  mensalidadesCobertas,
} from './calculadora';

describe('Calculadora de prejuízo de /assinar', () => {
  it('perda = vendas × % perdido × lucro médio', () => {
    assert.deepEqual(calcularPrejuizo({ vendasMes: 45, lucroMedio: 350, percentualPerdido: 10 }), {
      vendasPerdidasMes: 4.5,
      prejuizoMes: 1575,
      prejuizoAno: 18900,
    });
    assert.deepEqual(calcularPrejuizo(PADRAO_CALCULADORA), calcularPrejuizo({ vendasMes: 45, lucroMedio: 350, percentualPerdido: 10 }));
  });

  it('entradas inválidas ou negativas não geram prejuízo negativo', () => {
    assert.equal(calcularPrejuizo({ vendasMes: -10, lucroMedio: 350, percentualPerdido: 10 }).prejuizoMes, 0);
    assert.equal(calcularPrejuizo({ vendasMes: 10, lucroMedio: Number.NaN, percentualPerdido: 10 }).prejuizoMes, 0);
    assert.equal(calcularPrejuizo({ vendasMes: 10, lucroMedio: 100, percentualPerdido: 500 }).prejuizoMes, 1000);
  });

  it('mensalidades cobertas: só inteiras, e zero sem mensalidade', () => {
    assert.equal(mensalidadesCobertas(1575, 99.9), 15);
    assert.equal(mensalidadesCobertas(99, 99.9), 0);
    assert.equal(mensalidadesCobertas(1000, 0), 0);
  });

  it('barras relativas à maior, com mínimo visível', () => {
    assert.deepEqual(escalaDasBarras(1000, 100), { prejuizo: 1, mensalidade: 0.1 });
    assert.deepEqual(escalaDasBarras(50, 100), { prejuizo: 0.5, mensalidade: 1 });
    assert.deepEqual(escalaDasBarras(100000, 1), { prejuizo: 1, mensalidade: 0.02 });
    assert.deepEqual(escalaDasBarras(0, 0), { prejuizo: 0.02, mensalidade: 0.02 });
  });

  it('ponteiro do medidor vai de -90° a +90° e trava no fundo de escala', () => {
    assert.equal(anguloDoMedidor(0, 10000), -90);
    assert.equal(anguloDoMedidor(5000, 10000), 0);
    assert.equal(anguloDoMedidor(99999, 10000), 90);
    assert.equal(anguloDoMedidor(5000, 0), -90);
  });

  it('formata reais sem centavos', () => {
    assert.equal(formatarReais(1575).replace(/\s/g, ' '), 'R$ 1.575');
  });
});
