import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { idReciboValido, mascararCpf, mascararEmail, mascararTelefone, montarReciboPublico } from './publico';

describe('Recibo público', () => {
  it('só aceita o id completo da venda', () => {
    assert.ok(idReciboValido('9ede0ad5-733b-44b7-b303-bf640df12a60'));
    assert.ok(!idReciboValido('F12A60'));
    assert.ok(!idReciboValido(''));
    assert.ok(!idReciboValido(undefined));
  });

  it('não expõe custo, lucro nem dados internos da venda', () => {
    const recibo = montarReciboPublico(
      {
        id: 'v1',
        valor: 3000,
        custo: 2500,
        lucro: 500,
        percentualLucro: 16.7,
        clienteNome: 'Ana',
        itens: [{ descricao: 'iPhone 13', valorExibir: 3000, valorInterno: 2500, condicaoOriginal: 'seminovo', aparelhoId: 'x' }],
      },
      null,
      null
    );
    assert.equal(recibo.venda.valor, 3000);
    assert.equal('custo' in recibo.venda, false);
    assert.equal('lucro' in recibo.venda, false);
    assert.equal('percentualLucro' in recibo.venda, false);
    const item = (recibo.venda.itens as Record<string, unknown>[])[0];
    assert.equal(item.valorExibir, 3000);
    assert.equal('valorInterno' in item, false);
    assert.equal('aparelhoId' in item, false);
  });

  it('não expõe token do Mercado Pago nem configurações da loja', () => {
    const recibo = montarReciboPublico(
      { id: 'v1' },
      {
        nome: 'Phone Center',
        logo_url: 'https://x/logo.png',
        chave_pix: 'pix@loja.com',
        mp_access_token: 'APP_USR-segredo',
        dados_fiscais: { certificado: 'segredo' },
        configuracoes: { limite: 1 },
        dono_whatsapp: '5531999999999',
      },
      null
    );
    assert.equal(recibo.loja?.nome, 'Phone Center');
    assert.equal(recibo.loja?.chave_pix, 'pix@loja.com');
    assert.equal(JSON.stringify(recibo).includes('segredo'), false);
    assert.equal('dono_whatsapp' in (recibo.loja || {}), false);
  });

  it('mostra CPF, telefone e e-mail do cliente, mas não o endereço', () => {
    const recibo = montarReciboPublico(
      { id: 'v1' },
      null,
      { nome: 'Ana', cpf: '123.456.789-09', telefone: '(31) 99876-5432', email: 'ana.souza@gmail.com', endereco: 'Rua X, 10' }
    );
    assert.deepEqual(recibo.cliente, {
      nome: 'Ana',
      cpf: '123.456.789-09',
      telefone: '(31) 99876-5432',
      email: 'ana.souza@gmail.com',
    });
  });

  it('máscaras não inventam dado quando ele não existe', () => {
    assert.equal(mascararCpf(''), '');
    assert.equal(mascararTelefone('00000000000'), '');
    assert.equal(mascararTelefone('+55 31 99876-5432'), '(31) *****-5432');
    assert.equal(mascararEmail('sem@email.com'), '');
  });
});
