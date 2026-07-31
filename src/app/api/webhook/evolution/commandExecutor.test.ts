import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiPlan } from './commandExecutor';

test('parseGeminiPlan extracts a create_aparelho command', () => {
  const result = parseGeminiPlan(`{
    "type": "command",
    "action": "create_aparelho",
    "params": {
      "marca": "Apple",
      "modelo": "iPhone 15",
      "cor": "Preto",
      "condicao": "seminovo",
      "preco": 3200,
      "descricao": "Aparelho para estoque"
    }
  }`);

  assert.equal(result.type, 'command');
  assert.equal(result.action, 'create_aparelho');
  assert.equal(result.params.marca, 'Apple');
  assert.equal(result.params.modelo, 'iPhone 15');
});

test('parseGeminiPlan extracts a query_entities command', () => {
  const result = parseGeminiPlan(`{
    "type": "command",
    "action": "query_entities",
    "params": {
      "entity": "agendamentos",
      "term": "João"
    }
  }`);

  assert.equal(result?.type, 'command');
  assert.equal(result?.action, 'query_entities');
  assert.equal(result?.params.entity, 'agendamentos');
  assert.equal(result?.params.term, 'João');
});
