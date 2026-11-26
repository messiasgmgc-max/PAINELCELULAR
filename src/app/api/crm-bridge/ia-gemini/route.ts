import { NextRequest } from 'next/server';
import {
  autenticarBridgeAvancado,
  crmBridgeJson,
  crmBridgeOptionsResponse,
  resolverLojaAutorizada,
} from '@/lib/crm-bridge/auth';

export async function OPTIONS(req: NextRequest) {
  return crmBridgeOptionsResponse(req);
}

const MODELOS_GOOGLE_GEMINI = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-2.5-pro',
];

type AcaoIA = 'responder' | 'melhorar' | 'objecao' | 'avaliar_troca_texto' | 'livre';

function montarPrompt(acao: AcaoIA, texto: string, nomeLoja: string, contextoExtra?: string): string {
  const baseLoja = `Você é um vendedor especialista de iPhones e smartphones da loja "${nomeLoja}". Escreva em português do Brasil, de forma natural, educada, objetiva e pronta para enviar no WhatsApp (use emojis com moderação e negrito *assim* quando destacar valores/modelos).`;

  switch (acao) {
    case 'responder':
      return `${baseLoja}\n\nCrie uma resposta pronta para enviar ao cliente abaixo.${contextoExtra ? `\nContexto adicional: ${contextoExtra}` : ''}\n\nMensagem do cliente:\n"""${texto}"""\n\nResponda APENAS com a mensagem pronta para enviar no WhatsApp, sem explicações extras.`;
    case 'melhorar':
      return `${baseLoja}\n\nMelhore, corrija a ortografia e deixe mais persuasivo e profissional o rascunho abaixo, mantendo o sentido original.\n\nRascunho:\n"""${texto}"""\n\nResponda APENAS com o texto melhorado pronto para enviar no WhatsApp.`;
    case 'objecao':
      return `${baseLoja}\n\nO cliente apresentou a seguinte objeção de compra. Crie uma resposta curta, empática e persuasiva para quebrar a objeção destacando garantia, procedência, transferência de dados e facilidade de pagamento/troca.${contextoExtra ? `\nContexto: ${contextoExtra}` : ''}\n\nObjeção do cliente:\n"""${texto}"""\n\nResponda APENAS com a mensagem pronta para enviar no WhatsApp.`;
    case 'avaliar_troca_texto':
      return `${baseLoja}\n\nO cliente enviou a descrição abaixo do celular usado que quer dar na troca. Faça um resumo organizado dos pontos informados, indique se faltou alguma informação importante (modelo, GB, bateria %, peças trocadas, Face ID, marcas) e escreva uma resposta educada para enviar ao cliente.\n\nDescrição do cliente:\n"""${texto}"""`;
    default:
      return `${baseLoja}\n\nAtenda à solicitação do vendedor abaixo:\n${texto}${contextoExtra ? `\nContexto: ${contextoExtra}` : ''}`;
  }
}

async function chamarGoogleGemini(
  apiKey: string,
  prompt: string,
  modeloPreferido?: string
): Promise<{ texto: string; modelo: string }> {
  const modelos = modeloPreferido
    ? [modeloPreferido, ...MODELOS_GOOGLE_GEMINI.filter((m) => m !== modeloPreferido)]
    : MODELOS_GOOGLE_GEMINI;

  let ultimoErro = 'Falha ao consultar Google Gemini.';

  for (const modelo of modelos) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 700,
          },
        }),
      });
      clearTimeout(timeout);

      const data = await resp.json().catch(() => null);
      if (!resp.ok) {
        ultimoErro = data?.error?.message || `HTTP ${resp.status} no modelo ${modelo}`;
        continue;
      }

      const texto = data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text || '')
        .join('')
        .trim();

      if (texto) {
        return { texto, modelo };
      }
      ultimoErro = `Resposta vazia do modelo ${modelo}`;
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message : 'Erro de rede ao chamar Gemini';
    }
  }

  throw new Error(ultimoErro);
}

/**
 * POST /api/crm-bridge/ia-gemini
 * Copiloto de IA usando Google Gemini diretamente no CRM (alternativa nativa ao ChatGPT/OpenAI).
 */
export async function POST(req: NextRequest) {
  const auth = await autenticarBridgeAvancado(req);
  if (!auth.ok) {
    return crmBridgeJson({ ok: false, error: auth.error }, auth.status || 401, req);
  }

  const loja = await resolverLojaAutorizada(req, auth);
  const nomeLoja = loja?.nome || 'Lucas Imports';

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const texto = String(body.texto || body.prompt || '').trim();
    const acao = (String(body.acao || 'responder') as AcaoIA);
    const contextoExtra = body.contexto ? String(body.contexto).trim() : undefined;
    const modeloPreferido = body.modelo ? String(body.modelo).trim() : undefined;
    const customApiKey = body.geminiApiKey ? String(body.geminiApiKey).trim() : '';

    if (!texto) {
      return crmBridgeJson({ ok: false, error: 'Informe o texto ou mensagem para a IA Google Gemini.' }, 400, req);
    }

    const apiKey = customApiKey || (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return crmBridgeJson(
        { ok: false, error: 'GEMINI_API_KEY não configurada no servidor. Informe uma chave Google AI Studio.' },
        503,
        req
      );
    }

    const prompt = montarPrompt(acao, texto, nomeLoja, contextoExtra);
    const resultado = await chamarGoogleGemini(apiKey, prompt, modeloPreferido);

    return crmBridgeJson(
      {
        ok: true,
        provedor: 'google_gemini',
        modelo: resultado.modelo,
        loja: nomeLoja,
        resposta: resultado.texto,
      },
      200,
      req
    );
  } catch (err) {
    return crmBridgeJson(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao processar IA Google Gemini.' },
      502,
      req
    );
  }
}
