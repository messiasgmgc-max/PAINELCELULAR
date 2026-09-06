import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { 
  PLANOS_SISTEMA, 
  obterPlanoPorTipo, 
  calcularValoresPlano, 
  verificarPermissaoRecursoPlano,
  obterPlanoMinimoParaRecurso,
  WHATSAPP_SUPORTE,
  WHATSAPP_SUPORTE_URL
} from './planos-config';

describe('Sistema de Planos & Assinatura - Regras de Negócio', () => {
  it('deve possuir número de suporte WhatsApp correto', () => {
    assert.equal(WHATSAPP_SUPORTE, '5531993586377');
    assert.ok(WHATSAPP_SUPORTE_URL.includes('5531993586377'));
  });

  it('deve ter 3 planos com a precificação correta', () => {
    // Entrada: R$ 99,90
    assert.equal(PLANOS_SISTEMA.entrada.precos.mensal.valorMensal, 99.90);
    assert.equal(PLANOS_SISTEMA.entrada.precos.trimestral.valorMensal, 89.90);
    assert.equal(PLANOS_SISTEMA.entrada.precos.anual.valorMensal, 79.90);

    // Intermediário: R$ 189,00
    assert.equal(PLANOS_SISTEMA.intermediario.precos.mensal.valorMensal, 189.00);
    assert.equal(PLANOS_SISTEMA.intermediario.precos.trimestral.valorMensal, 169.00);
    assert.equal(PLANOS_SISTEMA.intermediario.precos.anual.valorMensal, 149.00);

    // Avançado: R$ 299,00
    assert.equal(PLANOS_SISTEMA.avancado.precos.mensal.valorMensal, 299.00);
    assert.equal(PLANOS_SISTEMA.avancado.precos.trimestral.valorMensal, 269.00);
    assert.equal(PLANOS_SISTEMA.avancado.precos.anual.valorMensal, 239.00);
  });

  it('deve isolar os recursos por nível de plano conforme especificações do produto', () => {
    // Fiado/Devedores (!abater, !saldo) disponível apenas a partir do Intermediário
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'fiado_devedores'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'fiado_devedores'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'fiado_devedores'), true);

    // Consulta de IMEI (!checarimei) disponível a partir do Intermediário
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'consulta_imei'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'consulta_imei'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'consulta_imei'), true);

    // Broadcast de listas para grupos (!broadcast) disponível a partir do Intermediário
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'broadcast_grupos'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'broadcast_grupos'), true);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'broadcast_grupos'), true);

    // Escuta em grupos multi-loja disponível apenas no Avançado
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'escuta_multiloja'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'escuta_multiloja'), false);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'escuta_multiloja'), true);

    // API REST para bots/sistemas próprios disponível apenas no Avançado
    assert.equal(verificarPermissaoRecursoPlano('entrada', 'api_key_acesso'), false);
    assert.equal(verificarPermissaoRecursoPlano('intermediario', 'api_key_acesso'), false);
    assert.equal(verificarPermissaoRecursoPlano('avancado', 'api_key_acesso'), true);
  });

  it('deve calcular dias de validade e descontos de periodicidade', () => {
    const calcTrim = calcularValoresPlano('intermediario', 'trimestral');
    assert.equal(calcTrim.diasValidade, 90);
    assert.equal(calcTrim.valorTotal, 507.00);

    const calcAnual = calcularValoresPlano('avancado', 'anual');
    assert.equal(calcAnual.diasValidade, 365);
    assert.equal(calcAnual.valorTotal, 2868.00);
  });
});
