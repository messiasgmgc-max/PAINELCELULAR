import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehMensagemDeEntradaEstoque,
  parseTextoEntradaAparelhos,
  parseLinhaEntrada,
  normalizarNomeModelo,
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
});
