import test from 'node:test';
import assert from 'node:assert/strict';
import {
  limparBase64Audio,
  normalizarComandoFaladoParaBot,
  transcreverAudioWhatsApp,
} from './audio-transcription';

test('limparBase64Audio remove prefixo data URI com codecs e identifica extensões corretamente', () => {
  const ogg = limparBase64Audio(
    'data:audio/ogg; codecs=opus;base64,T2dnUwACAAAAAAAAAAA=',
    'audio/ogg; codecs=opus'
  );
  assert.equal(ogg.cleanBase64, 'T2dnUwACAAAAAAAAAAA=');
  assert.equal(ogg.mimeType, 'audio/ogg');
  assert.equal(ogg.extensao, 'ogg');

  const m4a = limparBase64Audio('AAAAIGZ0eXBpc29t', 'audio/m4a');
  assert.equal(m4a.mimeType, 'audio/mp4');
  assert.equal(m4a.extensao, 'm4a');

  const mp3PorBytes = limparBase64Audio('SUQzAwAAAA==');
  assert.equal(mp3PorBytes.mimeType, 'audio/mpeg');
  assert.equal(mp3PorBytes.extensao, 'mp3');

  const oggPorBytes = limparBase64Audio('T2dnUwACAAAA');
  assert.equal(oggPorBytes.mimeType, 'audio/ogg');
  assert.equal(oggPorBytes.extensao, 'ogg');
});

test('normalizarComandoFaladoParaBot converte comandos explícitos falados com exclamação', () => {
  assert.equal(
    normalizarComandoFaladoParaBot('Exclamação fechamento.').comandoNormalizado,
    '!fechamento'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Ponto de exclamação modo vendas.').comandoNormalizado,
    '!modo vendas'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Comando emprestados.').comandoNormalizado,
    '!emprestados'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('! fechamento de ontem.').comandoNormalizado,
    '!fechamento ontem'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Bot, exclamação abater Lucas 500.').comandoNormalizado,
    '!abater Lucas 500'
  );
});

test('normalizarComandoFaladoParaBot converte atalhos de fechamento sem sequestrar perguntas mensais', () => {
  assert.equal(
    normalizarComandoFaladoParaBot('Fechamento.').comandoNormalizado,
    '!fechamento'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Bot, faz o fechamento de hoje.').comandoNormalizado,
    '!fechamento'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda o resumo do dia.').comandoNormalizado,
    '!fechamento'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Fechamento de ontem.').comandoNormalizado,
    '!fechamento ontem'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Fechamento do dia 15/11.').comandoNormalizado,
    '!fechamento 15/11'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Fechamento do dia 15 de novembro.').comandoNormalizado,
    '!fechamento 15/11'
  );

  const perguntaMensal = normalizarComandoFaladoParaBot('Como foi o fechamento do mês passado?');
  assert.equal(perguntaMensal.comandoNormalizado, 'Como foi o fechamento do mês passado?');
});

test('normalizarComandoFaladoParaBot converte listagem de emprestados sem interferir em registros de empréstimo', () => {
  assert.equal(
    normalizarComandoFaladoParaBot('Aparelhos emprestados.').comandoNormalizado,
    '!emprestados'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Quais aparelhos estão emprestados agora?').comandoNormalizado,
    '!emprestados'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda a lista de emprestados.').comandoNormalizado,
    '!emprestados'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Quem tá com celular emprestado?').comandoNormalizado,
    '!emprestados'
  );

  const registroEmprestimo = normalizarComandoFaladoParaBot(
    'Aparelho imei 350015753668064 emprestado para o Lucas'
  );
  assert.equal(
    registroEmprestimo.comandoNormalizado,
    'Aparelho imei 350015753668064 emprestado para o Lucas'
  );
});

test('normalizarComandoFaladoParaBot converte modos, estoque, ajuda e confirmação de notinha', () => {
  assert.equal(
    normalizarComandoFaladoParaBot('Coloca no modo vendas.').comandoNormalizado,
    '!modo vendas'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Muda pro modo estoque.').comandoNormalizado,
    '!modo estoque'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Ativa o modo múltiplo.').comandoNormalizado,
    '!modo multiplo'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Volta pro modo padrão.').comandoNormalizado,
    '!modo padrao'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Qual o modo do bot?').comandoNormalizado,
    '!modo'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda a lista atualizada.').comandoNormalizado,
    '!estoque'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda o estoque completo.').comandoNormalizado,
    '!estoque completo'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda a lista de atacado.').comandoNormalizado,
    '!lista atacado'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Manda o estoque no atacado.').comandoNormalizado,
    '!lista atacado'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Mostra o menu de ajuda.').comandoNormalizado,
    '!ajuda'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Pode confirmar a notinha.').comandoNormalizado,
    'confirmar'
  );
  assert.equal(
    normalizarComandoFaladoParaBot('Cancela a notinha.').comandoNormalizado,
    'cancelar'
  );
});

test('normalizarComandoFaladoParaBot normaliza capacidades e preserva comandos em linguagem natural', () => {
  const venda = normalizarComandoFaladoParaBot(
    'Astrogeek, vendi um iPhone 15 Pro de 256 gigas preto pro João por 4500 no Pix'
  );
  assert.equal(
    venda.textoLimpo,
    'Astrogeek, vendi um iPhone 15 Pro de 256 gigas preto pro João por 4500 no Pix'
  );
  assert.equal(
    venda.comandoNormalizado,
    'vendi um iPhone 15 Pro de 256GB preto pro João por 4500 no Pix'
  );

  const tera = normalizarComandoFaladoParaBot('Tem 16 Pro Max 1 tera no estoque?');
  assert.equal(tera.comandoNormalizado, 'Tem 16 Pro Max 1TB no estoque?');
});

test('transcreverAudioWhatsApp usa Groq Whisper como motor primário', async () => {
  const fetchOriginal = globalThis.fetch;
  const groqKeyOrig = process.env.GROQ_API_KEY;
  const geminiKeyOrig = process.env.GEMINI_API_KEY;

  try {
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';

    let chamouGemini = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.groq.com')) {
        return new Response(JSON.stringify({ text: 'Fechamento de ontem.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      chamouGemini = true;
      return new Response('erro', { status: 500 });
    }) as typeof fetch;

    const res = await transcreverAudioWhatsApp('T2dnUwACAAAA', 'audio/ogg; codecs=opus');
    assert.equal(res.sucesso, true);
    assert.equal(res.motor, 'groq');
    assert.equal(res.modelo, 'whisper-large-v3-turbo');
    assert.equal(res.textoLimpo, 'Fechamento de ontem.');
    assert.equal(res.comandoNormalizado, '!fechamento ontem');
    assert.equal(chamouGemini, false);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (groqKeyOrig === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOrig;
    if (geminiKeyOrig === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiKeyOrig;
  }
});

test('transcreverAudioWhatsApp faz fallback para Gemini quando Groq falha', async () => {
  const fetchOriginal = globalThis.fetch;
  const groqKeyOrig = process.env.GROQ_API_KEY;
  const geminiKeyOrig = process.env.GEMINI_API_KEY;

  try {
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';

    let tentativasGroq = 0;
    let tentativasGemini = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.groq.com')) {
        tentativasGroq++;
        return new Response('rate limit', { status: 429 });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        tentativasGemini++;
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Coloca no modo vendas.' }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const res = await transcreverAudioWhatsApp('T2dnUwACAAAA', 'audio/ogg');
    assert.equal(tentativasGroq, 2);
    assert.equal(tentativasGemini, 1);
    assert.equal(res.sucesso, true);
    assert.equal(res.motor, 'gemini');
    assert.equal(res.textoLimpo, 'Coloca no modo vendas.');
    assert.equal(res.comandoNormalizado, '!modo vendas');
  } finally {
    globalThis.fetch = fetchOriginal;
    if (groqKeyOrig === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOrig;
    if (geminiKeyOrig === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiKeyOrig;
  }
});

test('transcreverAudioWhatsApp retorna falha segura quando áudio vazio ou ambos motores falham', async () => {
  const fetchOriginal = globalThis.fetch;
  const groqKeyOrig = process.env.GROQ_API_KEY;
  const geminiKeyOrig = process.env.GEMINI_API_KEY;

  try {
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';

    globalThis.fetch = (async () => {
      return new Response('unavailable', { status: 503 });
    }) as typeof fetch;

    const vazio = await transcreverAudioWhatsApp('', 'audio/ogg');
    assert.equal(vazio.sucesso, false);

    const falhaMotores = await transcreverAudioWhatsApp('T2dnUwACAAAA', 'audio/ogg');
    assert.equal(falhaMotores.sucesso, false);
    assert.ok(falhaMotores.erro && falhaMotores.erro.length > 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (groqKeyOrig === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = groqKeyOrig;
    if (geminiKeyOrig === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = geminiKeyOrig;
  }
});
