import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  PLANOS_SISTEMA, 
  obterPlanoPorTipo, 
  calcularValoresPlano, 
  verificarPermissaoRecursoPlano,
  obterPlanoMinimoParaRecurso
} from './planos-config';

describe('planos-config', () => {
  it('deve possuir os 3 planos configurados corretamente', () => {
    assert.equal(PLANOS_SISTEMA.entrada.precos.mensal.valorMensal, 99.90);
    assert.equal(PLANOS_SISTEMA.intermediario.precos.mensal.valorMensal, 189.00);
    assert.equal(PLANOS_SISTEMA.avancado.precos.mensal.valorMensal, 299.00);
  });

  it('deve calcular descontos para trimestral e anual', () => {
    const calcEntradaAnual = calcularValoresPlano('entrada', 'anual');
    assert.equal(calcEntradaAnual.valorMensal, 79.90);
    assert.equal(calcEntradaAnual.diasValidade, 365);
    assert.equal(calcEntradaAnual.descontoPercentual, 20);

    const calcInterTrimestral = calcularValoresPlano('intermediario', 'trimestral');
    assert.equal(calcInterTrimestral.valorMensal, 169.00);
    assert.equal(calcInterTrimestral.diasValidade, 90);
  });

  it('deve validar permissões de recursos por plano', () => {
    // Entrada
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'bot_basico'), true);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'fiado_devedores'), false);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'consulta_imei'), false);
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'escuta_multiloja'), false);

    // Intermediário
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'bot_basico'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'fiado_devedores'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'consulta_imei'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'broadcast_grupos'), true);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'escuta_multiloja'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'api_key_acesso'), false);

    // Avançado
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'escuta_multiloja'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'api_key_acesso'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'auditoria_avancada'), true);
  });

  it('deve identificar plano mínimo para cada recurso', () => {
    assert.equal(obterPlanoMinimoParaRecurso('bot_basico'), 'entrada');
    assert.equal(obterPlanoMinimoParaRecurso('fiado_devedores'), 'intermediario');
    assert.equal(obterPlanoMinimoParaRecurso('escuta_multiloja'), 'avancado');
  });

  it('deve retornar plano entrada quando valor for nulo ou inválido', () => {
    assert.equal(obterPlanoPorTipo(null).id, 'entrada');
    assert.equal(obterPlanoPorTipo(undefined).id, 'entrada');
    assert.equal(obterPlanoPorTipo('desconhecido').id, 'entrada');
  });
});
