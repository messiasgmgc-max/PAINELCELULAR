/**
 * Ordem de tentativa dos modelos de IA.
 * Modelo principal definido como Gemini 3.8 Flash como primário,
 * seguido pelos fallbacks rápidos e confiáveis.
 */
export const MODELOS_GEMINI = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
];

/**
 * Fallback quando o Gemini inteiro falha. Modelos Groq de alto desempenho.
 */
export const MODELOS_GROQ = [
  'llama-3.3-70b-versatile',
  'qwen/qwen3.8-27b',
  'groq/compound-mini',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
];

/**
 * Timeout para chamadas de IA.
 */
export const TIMEOUT_IA_MS = 15000;

/**
 * Desligar thinking desnecessário reduz latência e consumo de tokens.
 */
export const SEM_THINKING = { thinkingBudget: 0 } as const;
