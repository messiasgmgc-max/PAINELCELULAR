import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPerfilMaisProximo } from './maquininhaTaxas';

test('calcula o perfil mais próximo para uma parcela desejada', () => {
  const resultado = calcularPerfilMaisProximo(3600, 300, 12, [
    { nome: 'Básico', porcentagem: 1.5 },
    { nome: 'Padrão', porcentagem: 2.49 },
    { nome: 'Premium', porcentagem: 3.5 },
  ]);

  assert.ok(resultado);
  assert.equal(resultado?.perfil.nome, 'Básico');
  assert.ok(resultado?.totalComTaxa > 3600);
});
