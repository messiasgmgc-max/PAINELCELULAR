import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selecionarCandidatosRestauracao } from './restauracao';

describe('Seleção para restauração em massa', () => {
  const aparelhos = [
    { id: 'ativo', ativo: true, status: 'disponivel', condicao: 'seminovo' },
    { id: 'baixado', ativo: false, status: 'baixado', condicao: 'novo' },
    { id: 'removido', ativo: false, status: 'disponivel', condicao: 'seminovo' },
    { id: 'vendido', ativo: false, status: 'vendido', condicao: 'vendido' },
    { id: 'ambiguo', ativo: false, status: 'disponivel', condicao: 'vendido' },
    { id: 'tecnico', ativo: false, status: 'manutencao', condicao: 'seminovo' },
  ];

  it('nunca ressuscita venda concluída', () => {
    const s = selecionarCandidatosRestauracao(aparelhos);
    assert.ok(!s.restaurar.some((a) => a.id === 'vendido'));
    assert.deepEqual(s.ignoradosVendidos.map((a) => a.id), ['vendido']);
  });

  it('deixa de fora a assinatura das remontagens com defeito', () => {
    // O roteiro diz que só a conferência física resolve esses — o filtro
    // literal "status != vendido" os traria de volta em massa.
    const s = selecionarCandidatosRestauracao(aparelhos);
    assert.deepEqual(s.ignoradosAmbiguos.map((a) => a.id), ['ambiguo']);
  });

  it('restaura só quem saiu sem ter sido vendido', () => {
    const s = selecionarCandidatosRestauracao(aparelhos);
    assert.deepEqual(s.restaurar.map((a) => a.id).sort(), ['baixado', 'removido']);
    assert.deepEqual(s.ignoradosManutencao.map((a) => a.id), ['tecnico']);
  });

  it('não considera quem já está ativo', () => {
    const s = selecionarCandidatosRestauracao(aparelhos);
    const todos = [...s.restaurar, ...s.ignoradosVendidos, ...s.ignoradosAmbiguos, ...s.ignoradosManutencao];
    assert.ok(!todos.some((a) => a.id === 'ativo'));
  });
});
