import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escoparHtmlRecibo } from './reciboParaPdf';
import { generateReciboA4Html } from '../reciboA4';

describe('Recibo para PDF', () => {
  it('escopa as regras do recibo e troca body pelo container', () => {
    const html = `<!DOCTYPE html><html><head><style>
      body { font-size: 11px; }
      th, td { border: 1px solid #000; }
      .no-border, .no-border td { border: none; }
    </style></head><body><table><tr><td>Oi</td></tr></table>
    <script>window.onload = function() { window.print(); };</script></body></html>`;

    const saida = escoparHtmlRecibo(html);
    assert.ok(saida.startsWith('<div class="recibo-pdf"><style>'));
    assert.match(saida, /\.recibo-pdf \{ font-size: 11px; \}/);
    assert.match(saida, /\.recibo-pdf th, \.recibo-pdf td \{/);
    assert.match(saida, /\.recibo-pdf \.no-border, \.recibo-pdf \.no-border td \{/);
    assert.ok(saida.includes('<td>Oi</td>'));
    assert.equal(saida.includes('window.print'), false);
    assert.equal(/<(html|head|body)\b/i.test(saida), false);
  });

  it('funciona com o recibo de verdade, sem o script de impressão', () => {
    const html = generateReciboA4Html(
      { id: 'bd1a4e8d-5a3e-4684-aab3-0d30b4106952', valor: 7700, metodo: 'pix', itens: [{ descricao: 'iPhone 17 Pro Max', valorExibir: 7700, quantidade: 1 }] },
      { nome: 'Lucas Imports' },
      { nome: 'Laís Fernandes' },
      false
    );
    const saida = escoparHtmlRecibo(html);
    assert.equal(saida.includes('window.print'), false);
    assert.ok(saida.includes('LUCAS IMPORTS'));
    assert.ok(saida.includes('.recibo-pdf .section-title'));
  });
});
