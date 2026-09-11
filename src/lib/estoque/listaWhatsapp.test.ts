import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bateriaParaLista, observacaoParaLista } from './listaWhatsapp';

describe('Lista de estoque para WhatsApp', () => {
  it('observação entre parênteses não fica "(Obs: (...))"', () => {
    assert.equal(observacaoParaLista('Obs: (CAM USADA) | ID: 43364592 | Bateria: 89% | IMEI: 2275'), 'CAM USADA');
    assert.equal(observacaoParaLista('Obs: ( TRASEIRA E TELA BOLINHA) | ID: 26381642 | Bateria: 87% | IMEI: 5030'), 'TRASEIRA E TELA BOLINHA');
    assert.equal(observacaoParaLista('Obs: (BG/TG) | ID: 87020617 | Bateria: 91% | IMEI: 9659'), 'BG/TG');
  });

  it('observação sem parênteses continua igual', () => {
    assert.equal(observacaoParaLista('Obs: TELA QUEBRADA | ID: 86971010 | Bateria: 82% | IMEI: 0188'), 'TELA QUEBRADA');
    assert.equal(observacaoParaLista('Obs: MSG BATERIA | ID: 09537670 | IMEI: 7954'), 'MSG BATERIA');
  });

  it('só dados técnicos não viram observação', () => {
    assert.equal(observacaoParaLista('ID: 16464341 | Bateria: 83% | IMEI: 3305'), '');
    assert.equal(observacaoParaLista('89% bateria | IMEI: 1234'), '');
    assert.equal(observacaoParaLista(null), '');
    assert.equal(observacaoParaLista('Obs: ' + 'X'.repeat(80)), '');
  });

  it('bateria mantém a porcentagem', () => {
    assert.equal(bateriaParaLista({ saude_bateria: '89%', observacoes: 'Obs: (CAM USADA) | Bateria: 89%' }), '89%');
    assert.equal(bateriaParaLista({ saude_bateria: '84' }), '84%');
  });

  it('sem coluna, a bateria vem da observação', () => {
    assert.equal(bateriaParaLista({ observacoes: 'Obs: (FACEID OFF) | ID: 1 | Bateria: 83% | IMEI: 3305' }), '83%');
    assert.equal(bateriaParaLista({ observacoes: 'Troca de tela | 91% bat' }), '91%');
    assert.equal(bateriaParaLista({ observacoes: 'Obs: MSG BATERIA | ID: 09537670' }), '');
    assert.equal(bateriaParaLista(null), '');
  });
});
