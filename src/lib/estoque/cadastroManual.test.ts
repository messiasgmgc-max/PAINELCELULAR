import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mensagemErroGravacaoAparelho, validarCadastroManual, type EntradaCadastroManual } from './cadastroManual';

// 490154203237518 é um IMEI de exemplo com dígito verificador válido.
const IMEI_VALIDO = '490154203237518';

function entrada(parcial: Partial<EntradaCadastroManual> = {}): EntradaCadastroManual {
  return {
    categoria: 'aparelho',
    marca: 'apple',
    modelo: 'iphone 13 pro max',
    imei: '',
    numeroSerie: '',
    capacidade: '128gb',
    cor: '',
    ...parcial,
  };
}

describe('validarCadastroManual', () => {
  it('normaliza marca, modelo e capacidade e grava vazio como null', () => {
    const r = validarCadastroManual(entrada(), { aparelhos: [] });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.marca, 'Apple');
    assert.equal(r.dados.modelo, 'iPhone 13 Pro Max');
    assert.equal(r.dados.capacidade, '128GB');
    assert.equal(r.dados.cor, null);
    assert.equal(r.dados.imei, null);
  });

  it("nunca devolve 'N/A'", () => {
    const r = validarCadastroManual(entrada({ capacidade: 'N/A', cor: 'n/a' }), { aparelhos: [] });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.capacidade, null);
    assert.equal(r.dados.cor, null);
  });

  it('exige marca e modelo', () => {
    assert.deepEqual(validarCadastroManual(entrada({ marca: ' ' }), { aparelhos: [] }), {
      ok: false,
      campo: 'marca',
      erro: 'Preencha a marca.',
    });
    const semModelo = validarCadastroManual(entrada({ modelo: 'N/A' }), { aparelhos: [] });
    assert.equal(semModelo.ok, false);
  });

  it('recusa IMEI com dígito verificador errado e IMEI incompleto (inclusive 14 dígitos)', () => {
    const errado = validarCadastroManual(entrada({ imei: '490154203237519' }), { aparelhos: [] });
    assert.equal(errado.ok, false);
    if (!errado.ok) assert.match(errado.erro, /dígito verificador/);

    const curto = validarCadastroManual(entrada({ imei: '4901542032' }), { aparelhos: [] });
    assert.equal(curto.ok, false);
    if (!curto.ok) assert.match(curto.erro, /10 de 15/);

    const quatorze = validarCadastroManual(entrada({ imei: IMEI_VALIDO.slice(0, 14) }), { aparelhos: [] });
    assert.equal(quatorze.ok, false);
    if (!quatorze.ok) assert.match(quatorze.erro, /14 de 15/);
  });

  it('aceita IMEI válido', () => {
    const r = validarCadastroManual(entrada({ imei: IMEI_VALIDO }), { aparelhos: [] });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.dados.imei, IMEI_VALIDO);
  });

  it('bloqueia IMEI que já está no estoque, mas não o que já saiu', () => {
    const noEstoque = [{ id: 'a1', marca: 'Apple', modelo: 'iPhone 13', imei: IMEI_VALIDO, ativo: true, status: 'disponivel', codigo: '12345678' }];
    const bloqueado = validarCadastroManual(entrada({ imei: IMEI_VALIDO }), { aparelhos: noEstoque });
    assert.equal(bloqueado.ok, false);
    if (!bloqueado.ok) assert.match(bloqueado.erro, /já está no estoque: Apple iPhone 13 \(código 12345678\)/);

    const vendido = [{ ...noEstoque[0], ativo: false, status: 'vendido' }];
    assert.equal(validarCadastroManual(entrada({ imei: IMEI_VALIDO }), { aparelhos: vendido }).ok, true);
  });

  it('na edição, o próprio aparelho não é duplicado e IMEI antigo sem mudança não é revalidado', () => {
    const proprio = [{ id: 'a1', imei: IMEI_VALIDO, ativo: true, status: 'disponivel' }];
    assert.equal(
      validarCadastroManual(entrada({ imei: IMEI_VALIDO }), { aparelhos: proprio, editandoId: 'a1', imeiOriginal: IMEI_VALIDO }).ok,
      true
    );
    // A importação do MercadoPhone guarda só os 4 últimos dígitos.
    assert.equal(
      validarCadastroManual(entrada({ imei: '7518' }), { aparelhos: [], editandoId: 'a2', imeiOriginal: '7518' }).ok,
      true
    );
  });

  it('não normaliza nome de perfume nem acessório como se fosse celular', () => {
    const r = validarCadastroManual(
      entrada({ categoria: 'perfume', marca: 'dior', modelo: 'sauvage', capacidade: '100ml', cor: 'Eau de Parfum (EDP)' }),
      { aparelhos: [] }
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.dados.marca, 'dior');
    assert.equal(r.dados.modelo, 'sauvage');
    assert.equal(r.dados.capacidade, '100ml');
  });
});

describe('mensagemErroGravacaoAparelho', () => {
  it('explica o índice único de IMEI no estoque', () => {
    const msg = mensagemErroGravacaoAparelho({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_aparelhos_imei_completo_no_estoque"',
    });
    assert.match(msg, /Já existe um aparelho com este IMEI no estoque/);
  });

  it('mostra a mensagem real do banco nos demais erros', () => {
    assert.match(
      mensagemErroGravacaoAparelho({ code: 'PGRST204', message: "Could not find the 'xyz' column" }),
      /Could not find the 'xyz' column/
    );
  });
});
