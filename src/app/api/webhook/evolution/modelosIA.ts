/**
 * Ordem de tentativa dos modelos de IA.
 *
 * A ordem NÃO é arbitrária: foi medida contra a chave desta conta. O primeiro
 * modelo da lista antiga (`gemini-3.5-flash`) respondia 429 em 100% das
 * chamadas, então toda mensagem do lojista começava com uma requisição
 * garantidamente perdida — era isso que aparecia como "problema de cota" mesmo
 * com pouquíssimas mensagens por dia.
 *
 * Medição (4 chamadas por modelo, via curl):
 *   gemini-3.1-flash-lite     4/4   0.91s
 *   gemini-3.7-flash          4/4   1.32s
 *   gemini-3.5-flash-lite     4/4   3.26s
 *   gemini-flash-lite-latest  4/4   4.17s
 *   gemini-3.6-flash          2/4   (503 nas demais)
 *   gemini-3.8-flash          1/4   (503 nas demais)
 *   gemini-flash-latest       1/4   (429/503 nas demais)
 *   gemini-3.5-flash          0/4   (429 em todas)
 *
 * Ao revisar, vale remedir: a disponibilidade dos modelos novos muda com o
 * tempo. Os quatro primeiros são os confiáveis; os demais ficam como último
 * recurso antes de cair para o Groq.
 */
export const MODELOS_GEMINI = [
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
];

/**
 * Fallback quando o Gemini inteiro falha. `qwen` e `compound-mini` aceitam
 * `response_format: json_object`; os `gpt-oss` rejeitam o JSON estrito com
 * frequência, então ficam por último.
 */
export const MODELOS_GROQ = [
  'qwen/qwen3.8-27b',
  'groq/compound-mini',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

/**
 * 6s abortava no cliente chamadas que o Google já tinha começado a processar —
 * gastando cota sem aproveitar a resposta. Os modelos confiáveis respondem em
 * ~1-4s; 15s cobre o pior caso sem prender o webhook.
 */
export const TIMEOUT_IA_MS = 15000;

/**
 * Extração de comando é tarefa estruturada: "pensar" só queima token e tempo.
 * Desligar derruba o custo de uma chamada trivial de 111 para 17 tokens.
 */
export const SEM_THINKING = { thinkingBudget: 0 } as const;
