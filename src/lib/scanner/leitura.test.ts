import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMATOS_LEITOR_NATIVO,
  escolherCodigoLido,
  normalizarValorLido,
  registrarLeitura,
} from './leitura';
import { interpretarIdentificador } from '../pdv/cadastroRapido';

const IMEI = '490154203237518';
/** FNC1/GS (0x1D) que o Code128 GS1 manda no meio do valor. */
const GS = String.fromCharCode(29);
const QUEBRA = String.fromCharCode(13, 10);

describe('Valor lido pela câmera', () => {
  it('tira espaço das pontas como antes', () => {
    assert.equal(normalizarValorLido(`  7891234567895 ${QUEBRA}`), '7891234567895');
  });

  it('troca FNC1/GS e quebra de linha de dentro do valor por espaço', () => {
    assert.equal(normalizarValorLido(`${GS}01078912345678${GS}21ABC`), '01078912345678 21ABC');
    assert.equal(
      normalizarValorLido(`IMEI1 356938035643809${QUEBRA}IMEI2 356938035643817`),
      'IMEI1 356938035643809 IMEI2 356938035643817'
    );
  });

  it('vazio e nulo viram texto vazio', () => {
    assert.equal(normalizarValorLido(null), '');
    assert.equal(normalizarValorLido(undefined), '');
    assert.equal(normalizarValorLido('   '), '');
  });

  it('não mexe no serial com o "S" da caixa da Apple: quem tira é o cadastro rápido', () => {
    const lido = normalizarValorLido('SF2LXK0ABHG7F');
    assert.equal(lido, 'SF2LXK0ABHG7F');
    assert.deepEqual(interpretarIdentificador(lido), { tipo: 'serial', numeroSerie: 'F2LXK0ABHG7F' });
  });

  it('IMEI lido segue válido para o cadastro rápido', () => {
    assert.deepEqual(interpretarIdentificador(normalizarValorLido(` ${IMEI} `)), {
      tipo: 'imei',
      imei: IMEI,
      completado: false,
    });
  });
});

describe('Escolha entre códigos do mesmo quadro', () => {
  it('prefere o IMEI válido entre os códigos da caixa do iPhone', () => {
    const escolhido = escolherCodigoLido([
      { rawValue: '194253401247', format: 'UPC_A' },
      { rawValue: 'SF2LXK0ABHG7F', format: 'CODE_128' },
      { rawValue: IMEI, format: 'CODE_128' },
    ]);
    assert.equal(escolhido, IMEI);
  });

  it('sem IMEI válido, fica o primeiro código', () => {
    assert.equal(
      escolherCodigoLido([
        { rawValue: '490154203237519', format: 'CODE_128' },
        { rawValue: '7891234567895', format: 'EAN_13' },
      ]),
      '490154203237519'
    );
  });

  it('usa displayValue quando rawValue vem vazio e ignora códigos vazios', () => {
    assert.equal(escolherCodigoLido([{ rawValue: '' }, { rawValue: null, displayValue: ' ABC123 ' }]), 'ABC123');
  });

  it('nada lido devolve null', () => {
    assert.equal(escolherCodigoLido([]), null);
    assert.equal(escolherCodigoLido(undefined), null);
    assert.equal(escolherCodigoLido([{ rawValue: '  ' }]), null);
  });
});

describe('Repetição no leitor contínuo', () => {
  it('primeira leitura é aceita', () => {
    const r = registrarLeitura('A', null, 1000);
    assert.equal(r.aceitar, true);
    assert.deepEqual(r.ultima, { valor: 'A', instante: 1000 });
  });

  it('mesmo código dentro do intervalo é ignorado e renova o instante', () => {
    const r = registrarLeitura('A', { valor: 'A', instante: 1000 }, 2500, 2000);
    assert.equal(r.aceitar, false);
    assert.deepEqual(r.ultima, { valor: 'A', instante: 2500 });
    // Continua parado na câmera: segue ignorado, mesmo passando 2s da primeira leitura.
    assert.equal(registrarLeitura('A', r.ultima, 4000, 2000).aceitar, false);
  });

  it('mesmo código depois do intervalo volta a ser aceito', () => {
    assert.equal(registrarLeitura('A', { valor: 'A', instante: 1000 }, 3000, 2000).aceitar, true);
  });

  it('código diferente é aceito na hora', () => {
    assert.equal(registrarLeitura('B', { valor: 'A', instante: 1000 }, 1001, 2000).aceitar, true);
  });
});

describe('Formatos do leitor nativo', () => {
  it('inclui Code128 (IMEI/serial da caixa), EAN-13, UPC-A e QR', () => {
    for (const f of ['CODE_128', 'EAN_13', 'UPC_A', 'QR_CODE']) {
      assert.ok((FORMATOS_LEITOR_NATIVO as readonly string[]).includes(f), f);
    }
  });
});
