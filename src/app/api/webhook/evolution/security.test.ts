import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { autenticarWebhook, registrarMensagemComoProcessada } from './security';

const SEGREDO = 'segredo-de-teste-123';

function req(init: { headers?: Record<string, string>; url?: string }) {
  return new Request(init.url || 'https://app.exemplo.com/api/webhook/evolution', {
    method: 'POST',
    headers: init.headers || {},
  });
}

describe('Segurança do webhook Evolution', () => {
  beforeEach(() => {
    process.env.EVOLUTION_WEBHOOK_SECRET = SEGREDO;
  });
  afterEach(() => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
  });

  it('aceita o token correto no header x-webhook-token', () => {
    const r = autenticarWebhook(req({ headers: { 'x-webhook-token': SEGREDO } }));
    assert.equal(r.autorizado, true);
  });

  it('aceita o token correto via query string ?token=', () => {
    const r = autenticarWebhook(req({ url: `https://app.exemplo.com/api/webhook/evolution?token=${SEGREDO}` }));
    assert.equal(r.autorizado, true);
  });

  it('recusa requisição sem nenhum token', () => {
    const r = autenticarWebhook(req({}));
    assert.equal(r.autorizado, false);
  });

  it('recusa token errado', () => {
    const r = autenticarWebhook(req({ headers: { 'x-webhook-token': 'errado' } }));
    assert.equal(r.autorizado, false);
  });

  it('recusa token que é apenas prefixo do segredo', () => {
    const r = autenticarWebhook(req({ headers: { 'x-webhook-token': SEGREDO.slice(0, 5) } }));
    assert.equal(r.autorizado, false);
  });

  it('mantém o webhook aberto (com alerta) enquanto o segredo não for configurado', () => {
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    const r = autenticarWebhook(req({}));
    assert.equal(r.autorizado, true);
    assert.equal(r.autorizado && r.modo, 'sem_segredo_configurado');
  });
});

describe('Idempotência de mensagens', () => {
  function fakeSupabase(erro: { code?: string; message: string } | null) {
    return {
      from() {
        return { insert: async () => ({ error: erro }) };
      },
    } as never;
  }

  it('processa a mensagem na primeira entrega', async () => {
    const ok = await registrarMensagemComoProcessada(fakeSupabase(null), 'MSG1', {});
    assert.equal(ok, true);
  });

  it('bloqueia a reentrega da mesma mensagem (unique_violation)', async () => {
    const ok = await registrarMensagemComoProcessada(
      fakeSupabase({ code: '23505', message: 'duplicate key' }),
      'MSG1',
      {}
    );
    assert.equal(ok, false);
  });

  it('não trava o bot se o banco falhar por outro motivo', async () => {
    const ok = await registrarMensagemComoProcessada(
      fakeSupabase({ code: '42P01', message: 'relation does not exist' }),
      'MSG2',
      {}
    );
    assert.equal(ok, true);
  });

  it('processa normalmente quando a mensagem não tem id', async () => {
    const ok = await registrarMensagemComoProcessada(fakeSupabase(null), '', {});
    assert.equal(ok, true);
  });
});
