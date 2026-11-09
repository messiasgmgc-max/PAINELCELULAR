import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehMensagemDeEntradaEstoque,
  parseTextoEntradaAparelhos,
  parseLinhaEntrada,
  normalizarNomeModelo,
  ehRelatorioOuConferencia,
} from './entradaInteligente';

describe('Entrada Inteligente de Aparelhos', () => {
  it('detecta gatilhos de mensagem de entrada', () => {
    assert.equal(ehMensagemDeEntradaEstoque('Entradas: 13 128gb azul 2200'), true);
    assert.equal(ehMensagemDeEntradaEstoque('Entrada: iPhone 14 128gb'), true);
    assert.equal(ehMensagemDeEntradaEstoque('dar entrada: 15 pro max'), true);
    assert.equal(ehMensagemDeEntradaEstoque('!entradas 13 128gb 2000'), true);
    assert.equal(ehMensagemDeEntradaEstoque('chegaram os aparelhos:'), true);
    assert.equal(ehMensagemDeEntradaEstoque('bom dia equipe'), false);
    assert.equal(ehMensagemDeEntradaEstoque('quanto tá o iphone 13?'), false);
  });

  it('normaliza modelos e apelidos Apple', () => {
    assert.equal(normalizarNomeModelo('13 pm').modelo, 'iPhone 13 Pro Max');
    assert.equal(normalizarNomeModelo('15 pro max').modelo, 'iPhone 15 Pro Max');
    assert.equal(normalizarNomeModelo('14').modelo, 'iPhone 14');
  });

  it('faz parse de itens separados por vírgula em linha única', () => {
    const texto = 'Entradas: iPhone 13 128gb azul 2200, iPhone 14 128gb preto 3100';
    const itens = parseTextoEntradaAparelhos(texto);

    assert.equal(itens.length, 2);
    assert.equal(itens[0].modelo, 'iPhone 13');
    assert.equal(itens[0].capacidade, '128GB');
    assert.equal(itens[0].cor, 'Azul');
    assert.equal(itens[0].custo, 2200);
    assert.equal(itens[0].preco, 2500);

    assert.equal(itens[1].modelo, 'iPhone 14');
    assert.equal(itens[1].capacidade, '128GB');
    assert.equal(itens[1].cor, 'Preto');
    assert.equal(itens[1].custo, 3100);
  });

  it('faz parse de lista com múltiplas linhas e emojis de fornecedor', () => {
    const lista = `
      Entrada:
      📱 iPhone 15 Pro Max 256GB 🔘 Titânio Natural 5200
      📱 iPhone 13 128GB 🔵 Azul 2300
    `;
    const itens = parseTextoEntradaAparelhos(lista);

    assert.equal(itens.length, 2);
    assert.equal(itens[0].modelo, 'iPhone 15 Pro Max');
    assert.equal(itens[0].capacidade, '256GB');
    assert.equal(itens[0].cor, 'Titânio Natural');
    assert.equal(itens[0].custo, 5200);

    assert.equal(itens[1].modelo, 'iPhone 13');
    assert.equal(itens[1].capacidade, '128GB');
    assert.equal(itens[1].cor, 'Azul');
    assert.equal(itens[1].custo, 2300);
  });

  it('identifica IMEI quando fornecido na linha', () => {
    const linha = '13 pro max 128gb verde custo 3000 imei 350015753668064';
    const item = parseLinhaEntrada(linha);

    assert.ok(item);
    assert.equal(item.modelo, 'iPhone 13 Pro Max');
    assert.equal(item.capacidade, '128GB');
    assert.equal(item.cor, 'Verde');
    assert.equal(item.custo, 3000);
    assert.equal(item.imei, '350015753668064');
  });

  it('evita duplicação de marca e modelo (Apple / iPhone)', () => {
    assert.equal(normalizarNomeModelo('IPHONE APPLE IPHONE 16 PRO').modelo, 'iPhone 16 Pro');
    assert.equal(normalizarNomeModelo('Apple iPhone 16 Pro').modelo, 'iPhone 16 Pro');
    assert.equal(normalizarNomeModelo('iPhone 16 Pro').modelo, 'iPhone 16 Pro');
    assert.equal(normalizarNomeModelo('16 Pro').modelo, 'iPhone 16 Pro');
    assert.equal(normalizarNomeModelo('16p').modelo, 'iPhone 16 Pro');
    assert.equal(normalizarNomeModelo('16pm').modelo, 'iPhone 16 Pro Max');
  });

  it('extrai cor Desert, Titânio Natural e emojis de coração corretamente', () => {
    const itemDesert = parseLinhaEntrada('iPhone 16 Pro 128GB Desert 5000');
    assert.ok(itemDesert);
    assert.equal(itemDesert.modelo, 'iPhone 16 Pro');
    assert.equal(itemDesert.cor, 'Desert');
    assert.equal(itemDesert.capacidade, '128GB');
    assert.equal(itemDesert.custo, 5000);

    const itemEmojiDesert = parseLinhaEntrada('📱 16 Pro Max 256GB 🏜️ 6200');
    assert.ok(itemEmojiDesert);
    assert.equal(itemEmojiDesert.modelo, 'iPhone 16 Pro Max');
    assert.equal(itemEmojiDesert.cor, 'Desert');

    const itemCoracaoPreto = parseLinhaEntrada('iPhone 15 128GB 🖤 3200');
    assert.ok(itemCoracaoPreto);
    assert.equal(itemCoracaoPreto.modelo, 'iPhone 15');
    assert.equal(itemCoracaoPreto.cor, 'Preto');

    const itemNatural = parseLinhaEntrada('15 Pro 128gb Titânio Natural 4300');
    assert.ok(itemNatural);
    assert.equal(itemNatural.modelo, 'iPhone 15 Pro');
    assert.equal(itemNatural.cor, 'Titânio Natural');
  });

  it('reconhece IMEI e NÃO confunde com custo quando não tem R$', () => {
    // 1. Linha com IMEI puro de 15 dígitos sem valor (não deve achar que IMEI é custo!)
    const linhaComImeiPuro = 'Entrada iPhone 16 Pro 128GB Desert 356829104829102';
    const itemA = parseLinhaEntrada(linhaComImeiPuro);
    assert.ok(itemA);
    assert.equal(itemA.modelo, 'iPhone 16 Pro');
    assert.equal(itemA.capacidade, '128GB');
    assert.equal(itemA.cor, 'Desert');
    assert.equal(itemA.imei, '356829104829102');
    assert.equal(itemA.custo, 0); // Sem R$ e sem prefixo, IMEI NÃO é custo!

    // 2. Linha com prefixo explícito de IMEI
    const linhaComPrefixoImei = 'iPhone 16 Pro Desert imei: 356829104829102';
    const itemB = parseLinhaEntrada(linhaComPrefixoImei);
    assert.ok(itemB);
    assert.equal(itemB.modelo, 'iPhone 16 Pro');
    assert.equal(itemB.cor, 'Desert');
    assert.equal(itemB.imei, '356829104829102');
    assert.equal(itemB.custo, 0);

    // 3. Linha com R$ e IMEI
    const linhaComValorEImei = 'iPhone 16 Pro 128GB Desert R$ 5200 IMEI 356829104829102';
    const itemC = parseLinhaEntrada(linhaComValorEImei);
    assert.ok(itemC);
    assert.equal(itemC.modelo, 'iPhone 16 Pro');
    assert.equal(itemC.custo, 5200);
    assert.equal(itemC.imei, '356829104829102');
  });

  it('NUNCA interpreta relatórios de conferência de estoque ou listas de faltantes como entrada', () => {
    const relatorioConferenciaReal = `📦 *CONFERÊNCIA DE ESTOQUE - LUCAS IMPORTS *
📅 Data: 09/11/2026 às 09:06
📊 Resumo: 86 de 105 encontrados (19 faltantes)

⚠️ *APARELHOS FALTANTES (19):*

🔹 *iPhone 13* (7 un):
  - iPhone 13 · 128GB · ⚪️  Branco 3265
  - iPhone 13 · 128GB · ⚫️  Preto · IMEI final: ...5314
  - iPhone 13 · 128GB · ⚫️ Preto · IMEI final: ...6648
  - iPhone 13 · 128GB · 🌸 Rosa · IMEI final: ...3681
  - iPhone 13 · 128GB · 🔵 Azul · IMEI final: ...6814
  - iPhone 13 · 128GB · 🔵 Azul · IMEI final: ...9802
  - iPhone 13 · 128GB · 🟢 Verde · IMEI final: ...9230

🔹 *iPhone 14 Pro* (2 un):
  - iPhone 14 Pro · 128GB · 🟣  Roxo · IMEI final: ...9576
  - iPhone 14 Pro · 128GB · 🟣  Roxo · IMEI final: ...8066

🔹 *iPhone 14 Pro Max* (2 un):
  - iPhone 14 Pro Max · 128GB
  - iPhone 14 Pro Max · 128GB · ⚫️  Preto · IMEI final: ...5601

🔹 *iPhone 15* (3 un):
  - iPhone 15 · 128GB
  - iPhone 15 · 128GB · 🔵 Azul · IMEI final: ...6714
  - iPhone 15 · 128GB · Azul

🔹 *iPhone 15 Pro Max* (3 un):
  - iPhone 15 Pro Max · 256GB
  - iPhone 15 Pro Max · 256GB · 🔵  Azul · IMEI final: ...8508
  - iPhone 15 Pro Max · 512GB · Preto

🔹 *iPhone Apple iPhone 16 Pro* (1 un):
  - iPhone Apple iPhone 16 Pro · 128GB

🔹 *iPhone 17 Pro* (1 un):
  - iPhone 17 Pro · 256GB · ⚪️  Branco · IMEI final: ...9305

_Relatório gerado pelo Painel Phone Center_`;

    assert.equal(ehRelatorioOuConferencia(relatorioConferenciaReal), true);
    assert.equal(ehMensagemDeEntradaEstoque(relatorioConferenciaReal), false);
    assert.deepEqual(parseTextoEntradaAparelhos(relatorioConferenciaReal), []);

    // Outras variantes de conferência e relatórios de sistema
    assert.equal(ehRelatorioOuConferencia('📦 CONFERÊNCIA DE ESTOQUE finalizada com sucesso'), true);
    assert.equal(ehRelatorioOuConferencia('Relatório de saídas do dia 09/11'), true);
    assert.equal(ehRelatorioOuConferencia('Extrato de vendas do mês'), true);
    assert.equal(ehRelatorioOuConferencia('Aparelhos faltantes na auditoria'), true);

    // Entrada legítima deve continuar funcionando
    assert.equal(ehRelatorioOuConferencia('Entradas: iPhone 13 128gb azul 2200'), false);
    assert.equal(ehMensagemDeEntradaEstoque('Entradas: iPhone 13 128gb azul 2200'), true);
  });
});
