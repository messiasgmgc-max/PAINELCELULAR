import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarAcesso, lojaEfetiva, tokenDaRequisicao, type UsuarioServidor } from './acesso';

const LOJA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOJA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const usuario = (p: Partial<UsuarioServidor> = {}): UsuarioServidor => ({
  id: 'u1',
  email: 'dono@loja.com',
  nome: 'Dono',
  role: 'admin',
  lojaId: LOJA_A,
  superAdmin: false,
  ...p,
});

describe('Acesso às rotas da API', () => {
  it('sem sessão, 401', () => {
    assert.deepEqual(avaliarAcesso(null), { ok: false, status: 401, erro: 'Entre de novo para continuar.' });
  });

  it('usuário de uma loja não acessa outra', () => {
    const r = avaliarAcesso(usuario(), { lojaId: LOJA_B });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 403);
    assert.equal(avaliarAcesso(usuario(), { lojaId: LOJA_A }).ok, true);
  });

  it('sem loja informada, vale a do usuário; usuário sem loja é recusado', () => {
    assert.equal(avaliarAcesso(usuario(), { lojaId: null }).ok, true);
    assert.equal(avaliarAcesso(usuario({ lojaId: null }), { lojaId: null }).ok, false);
  });

  it('papel e super admin', () => {
    assert.equal(avaliarAcesso(usuario({ role: 'vendedor' }), { papeis: ['admin', 'gerente'] }).ok, false);
    assert.equal(avaliarAcesso(usuario(), { superAdmin: true }).ok, false);
    const mestre = usuario({ role: 'super_admin', superAdmin: true, lojaId: null });
    assert.equal(avaliarAcesso(mestre, { superAdmin: true, lojaId: LOJA_B, papeis: ['admin'] }).ok, true);
  });

  it('loja efetiva ignora o que o navegador mandou, exceto para super admin', () => {
    assert.equal(lojaEfetiva(usuario(), LOJA_B), LOJA_A);
    assert.equal(lojaEfetiva(usuario({ superAdmin: true }), LOJA_B), LOJA_B);
  });

  it('lê o token do cabeçalho ou do cookie da sessão', () => {
    assert.equal(tokenDaRequisicao('Bearer abc.def', null), 'abc.def');
    assert.equal(tokenDaRequisicao(null, 'tema=escuro; sessao_usuario=xyz.123; outro=1'), 'xyz.123');
    assert.equal(tokenDaRequisicao(null, 'tema=escuro'), null);
    assert.equal(tokenDaRequisicao('', ''), null);
  });
});
