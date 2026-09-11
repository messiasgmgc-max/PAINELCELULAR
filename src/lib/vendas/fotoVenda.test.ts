import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitoVerificadorImei } from '../pdv/cadastroRapido';
import {
  camposFaltantesDaVenda,
  mesclarFotosNaVenda,
  normalizarLeituraFoto,
  type LeituraFotoVenda,
  type VendaLida,
} from './fotoVenda';

const imeiCom = (primeiros14: string) => primeiros14 + digitoVerificadorImei(primeiros14);
const IMEI_1 = imeiCom('35392106123456');
const IMEI_2 = imeiCom('35392106123457');
/** Mesmo IMEI 1 com o último dígito trocado: falha no dígito verificador. */
const IMEI_ERRADO = IMEI_1.slice(0, 14) + ((Number(IMEI_1[14]) + 1) % 10);

function leitura(parcial: Partial<LeituraFotoVenda> = {}): LeituraFotoVenda {
  return {
    imeis: [],
    imeisInvalidos: [],
    numeroSerie: null,
    modelo: null,
    capacidade: null,
    cor: null,
    saudeBateria: null,
    condicao: null,
    ...parcial,
  };
}

test('normalizarLeituraFoto separa IMEIs válidos, inválidos e repetidos', () => {
  const l = normalizarLeituraFoto({
    imeis: [IMEI_1, `${IMEI_2.slice(0, 5)} ${IMEI_2.slice(5)}`, IMEI_ERRADO, '123'],
    imei: IMEI_1,
  });
  assert.deepEqual(l.imeis, [IMEI_1, IMEI_2]);
  assert.deepEqual(l.imeisInvalidos, [IMEI_ERRADO]);
});

test('normalizarLeituraFoto limpa série, bateria, capacidade, condição e nulos em texto', () => {
  const l = normalizarLeituraFoto({
    numero_serie: 'f2lx-k0ab cd12',
    saude_bateria: '88%',
    capacidade: '256 gb',
    condicao: 'Lacrado',
    modelo: 'null',
    cor: ' Azul-sierra ',
  });
  assert.equal(l.numeroSerie, 'F2LXK0ABCD12');
  assert.equal(l.saudeBateria, 88);
  assert.equal(l.capacidade, '256GB');
  assert.equal(l.condicao, 'novo');
  assert.equal(l.modelo, null);
  assert.equal(l.cor, 'Azul-sierra');

  assert.equal(normalizarLeituraFoto({ numero_serie: '123456789012' }).numeroSerie, null, 'só dígitos não é série');
  assert.equal(normalizarLeituraFoto({ saude_bateria: 140 }).saudeBateria, null);
  assert.equal(normalizarLeituraFoto({ condicao: 'Seminovo' }).condicao, 'seminovo');
  assert.deepEqual(normalizarLeituraFoto(null).imeis, []);
});

test('sem IMEI no texto, usa o IMEI válido da foto e completa o aparelho', () => {
  const venda: VendaLida = { aparelho: { modelo: 'iPhone 13 Pro', capacidade: null } };
  const r = mesclarFotosNaVenda(venda, [
    leitura({ imeis: [IMEI_1, IMEI_2], capacidade: '256GB', cor: 'Grafite', saudeBateria: 87, condicao: 'seminovo' }),
  ]);
  assert.equal(venda.aparelho?.imei, IMEI_1);
  assert.equal(venda.aparelho?.capacidade, '256GB');
  assert.equal(venda.aparelho?.cor, 'Grafite');
  assert.equal(venda.aparelho?.saudeBateria, 87);
  assert.deepEqual(r.imeis, [IMEI_1, IMEI_2]);
  assert.deepEqual(r.camposDaFoto.sort(), ['capacidade', 'condicao', 'cor', 'imei', 'saudeBateria']);
  assert.deepEqual(r.avisos, []);
});

test('IMEI do texto igual ao IMEI 2 da foto não gera aviso', () => {
  const venda: VendaLida = { aparelho: { imei: IMEI_2 } };
  const r = mesclarFotosNaVenda(venda, [leitura({ imeis: [IMEI_1, IMEI_2] })]);
  assert.equal(venda.aparelho?.imei, IMEI_2);
  assert.deepEqual(r.avisos, []);
  assert.ok(!r.camposDaFoto.includes('imei'));
});

test('IMEI válido do texto diferente da foto: mantém o do texto e avisa', () => {
  const venda: VendaLida = { aparelho: { imei: IMEI_2 } };
  const r = mesclarFotosNaVenda(venda, [leitura({ imeis: [IMEI_1] })]);
  assert.equal(venda.aparelho?.imei, IMEI_2);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /diferente do da foto/);
});

test('IMEI do texto com dígito verificador errado é trocado pelo da foto, com aviso', () => {
  const venda: VendaLida = { aparelho: { imei: IMEI_ERRADO } };
  const r = mesclarFotosNaVenda(venda, [leitura({ imeis: [IMEI_1] })]);
  assert.equal(venda.aparelho?.imei, IMEI_1);
  assert.ok(r.camposDaFoto.includes('imei'));
  assert.match(r.avisos[0], /não confere/);
});

test('IMEI da foto que não confere nunca entra na venda', () => {
  const venda: VendaLida = { aparelho: { modelo: 'iPhone 12' } };
  const r = mesclarFotosNaVenda(venda, [leitura({ imeisInvalidos: [IMEI_ERRADO] })]);
  assert.equal(venda.aparelho?.imei, undefined);
  assert.match(r.avisos[0], /não confere pelo dígito verificador/);
});

test('sem IMEI, a série da foto identifica o aparelho', () => {
  const venda: VendaLida = {};
  const r = mesclarFotosNaVenda(venda, [leitura({ numeroSerie: 'F2LXK0ABCD12' })]);
  assert.equal(venda.aparelho?.imei, 'F2LXK0ABCD12');
  assert.equal(venda.aparelho?.numeroSerie, 'F2LXK0ABCD12');
  assert.ok(r.camposDaFoto.includes('imei'));
});

test('o texto manda no modelo e na capacidade; diferença de verdade vira aviso', () => {
  const igual: VendaLida = { aparelho: { modelo: 'Apple iPhone 13 Pro', capacidade: '128gb' } };
  const r1 = mesclarFotosNaVenda(igual, [leitura({ modelo: 'iPhone 13 Pro', capacidade: '128GB' })]);
  assert.deepEqual(r1.avisos, []);

  const marca: VendaLida = { aparelho: { modelo: 'Galaxy S23' } };
  assert.deepEqual(mesclarFotosNaVenda(marca, [leitura({ modelo: 'Samsung Galaxy S23' })]).avisos, []);

  const diferente: VendaLida = { aparelho: { modelo: 'iPhone 13', capacidade: '128GB' } };
  const r2 = mesclarFotosNaVenda(diferente, [leitura({ modelo: 'iPhone 13 Pro', capacidade: '256GB' })]);
  assert.equal(diferente.aparelho?.modelo, 'iPhone 13');
  assert.equal(diferente.aparelho?.capacidade, '128GB');
  assert.equal(r2.avisos.length, 2);
});

test('várias fotos: cada campo vem da primeira que leu; foto ilegível vira aviso', () => {
  const venda: VendaLida = {};
  const r = mesclarFotosNaVenda(venda, [
    leitura({ modelo: 'iPhone 14' }),
    null,
    leitura({ modelo: 'iPhone 15', imeis: [IMEI_1], saudeBateria: 91 }),
  ]);
  assert.equal(venda.aparelho?.modelo, 'iPhone 14');
  assert.equal(venda.aparelho?.imei, IMEI_1);
  assert.equal(venda.aparelho?.saudeBateria, 91);
  assert.deepEqual(r.avisos, ['Não consegui ler a foto 2. Tire outra mais nítida ou digite os dados.']);
});

test('foto lida sem nenhum dado do aparelho avisa', () => {
  const r = mesclarFotosNaVenda({}, [leitura()]);
  assert.match(r.avisos[0], /não achou dados do aparelho/);
});

test('camposFaltantesDaVenda confere os obrigatórios nos dados e mantém extras da IA', () => {
  const venda: VendaLida = {
    aparelho: { modelo: 'iPhone 13', capacidade: '128GB' },
    valorTotal: 3500,
    formaPagamento: null,
    dataVenda: '2026-09-11',
    camposFaltantes: ['modelo', 'imei', 'cpf', 'vendedor'],
  };
  assert.deepEqual(camposFaltantesDaVenda(venda), ['formaPagamento', 'vendedor']);
  assert.deepEqual(camposFaltantesDaVenda({}), ['modelo', 'capacidade', 'valorTotal', 'formaPagamento', 'dataVenda']);
});
