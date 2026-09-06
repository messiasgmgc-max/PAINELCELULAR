import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeminiPlan, buildWhatsAppText } from './commandExecutor';

test('parseGeminiPlan extracts a create_aparelho command (legacy compatibility)', () => {
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

  assert.ok(result);
  assert.equal(result.type, 'command');
  assert.equal(result.action, 'create_aparelho');
  assert.equal(result.confianca, 'alta'); // Default retrocompatível
  assert.equal(result.params.marca, 'Apple');
  assert.equal(result.params.modelo, 'iPhone 15');
});

test('parseGeminiPlan extracts create_venda with alta confiança', () => {
  const raw = `\`\`\`json
  {
    "type": "command",
    "action": "create_venda",
    "params": {
      "modelo": "iPhone 13 Pro",
      "comprador": "Lucas",
      "valor": 2500
    },
    "confianca": "alta"
  }
  \`\`\``;

  const result = parseGeminiPlan(raw);
  assert.ok(result);
  assert.equal(result.action, 'create_venda');
  assert.equal(result.confianca, 'alta');
  assert.equal(result.params.modelo, 'iPhone 13 Pro');
  assert.equal(result.params.comprador, 'Lucas');
  assert.equal(result.params.valor, 2500);
});

test('parseGeminiPlan extracts media confiança with campoFaltante and perguntaClarificacao', () => {
  const raw = `{
    "type": "command",
    "action": "create_venda",
    "params": {
      "comprador": "Lucas"
    },
    "confianca": "media",
    "campoFaltante": "valor e modelo",
    "perguntaClarificacao": "Qual é o modelo do aparelho e o valor da venda para o Lucas?"
  }`;

  const result = parseGeminiPlan(raw);
  assert.ok(result);
  assert.equal(result.action, 'create_venda');
  assert.equal(result.confianca, 'media');
  assert.equal(result.campoFaltante, 'valor e modelo');
  assert.equal(result.perguntaClarificacao, 'Qual é o modelo do aparelho e o valor da venda para o Lucas?');
});

test('parseGeminiPlan extracts update_preco and abater_divida commands', () => {
  const planPreco = parseGeminiPlan(`{
    "type": "command",
    "action": "update_preco",
    "params": { "aparelho": "X", "novoPreco": 3000 },
    "confianca": "alta"
  }`);
  assert.ok(planPreco);
  assert.equal(planPreco.action, 'update_preco');
  assert.equal(planPreco.params.novoPreco, 3000);

  const planAbater = parseGeminiPlan(`{
    "type": "command",
    "action": "abater_divida",
    "params": { "cliente": "João", "valor": 300 },
    "confianca": "alta"
  }`);
  assert.ok(planAbater);
  assert.equal(planAbater.action, 'abater_divida');
  assert.equal(planAbater.params.valor, 300);
});

test('parseGeminiPlan handles baixa confiança', () => {
  const raw = `{
    "type": "command",
    "action": "search_entities",
    "params": {},
    "confianca": "baixa"
  }`;

  const result = parseGeminiPlan(raw);
  assert.ok(result);
  assert.equal(result.confianca, 'baixa');
});

test('parseGeminiPlan returns null for invalid JSON or non-command types', () => {
  assert.equal(parseGeminiPlan('Olá, bom dia!'), null);
  assert.equal(parseGeminiPlan('{ "foo": "bar" }'), null);
  assert.equal(parseGeminiPlan(''), null);
});

test('buildWhatsAppText formats create_venda with rich WhatsApp text', () => {
  const text = buildWhatsAppText('create_venda', {
    modelo: 'iPhone 13 Pro',
    comprador: 'Lucas',
    valor: 2500,
  }, '5511999999999');

  assert.ok(text.includes('Venda Registrada com Sucesso!'));
  assert.ok(text.includes('iPhone 13 Pro'));
  assert.ok(text.includes('Lucas'));
  assert.ok(text.includes('2500,00'));
  assert.ok(!text.includes('{') && !text.includes('}')); // Não deve ter JSON cru
});

test('buildWhatsAppText formats generate_etiquetas with rich WhatsApp text', () => {
  const text = buildWhatsAppText('generate_etiquetas', {
    quantidade: 5,
    modelo: 'iPhone 15 Pro Max',
  }, '5511999999999');

  assert.ok(text.includes('Etiquetas Geradas'));
  assert.ok(text.includes('5 etiqueta(s)'));
  assert.ok(!text.includes('{') && !text.includes('}'));
});

test('buildWhatsAppText formats list_estoque with rich WhatsApp text', () => {
  const text = buildWhatsAppText('list_estoque', {
    total: 8,
    resumo: '• 3x iPhone 15 Pro Max 256GB\n• 5x iPhone 13 128GB',
  }, '5511999999999');

  assert.ok(text.includes('Consulta de Estoque Realizada'));
  assert.ok(text.includes('Total de itens encontrados: 8'));
  assert.ok(text.includes('iPhone 15 Pro Max'));
});

test('buildWhatsAppText formats update_preco and abater_divida with rich text', () => {
  const textPreco = buildWhatsAppText('update_preco', {
    aparelho: 'iPhone 14',
    novoPreco: 3200,
  }, '5511999999999');
  assert.ok(textPreco.includes('Preço Atualizado com Sucesso!'));
  assert.ok(textPreco.includes('3200,00'));

  const textAbater = buildWhatsAppText('abater_divida', {
    cliente: 'Marcelo',
    valor: 500,
  }, '5511999999999');
  assert.ok(textAbater.includes('Abatimento Registrado!'));
  assert.ok(textAbater.includes('Marcelo'));
  assert.ok(textAbater.includes('500,00'));
});

