import { MODELOS_GEMINI, SEM_THINKING, TIMEOUT_IA_MS } from '@/app/api/webhook/evolution/modelosIA';

export type AudioExtensaoSuportada = 'ogg' | 'm4a' | 'mp3' | 'wav' | 'webm' | 'flac';

export interface LimparAudioResult {
  cleanBase64: string;
  mimeType: string;
  extensao: AudioExtensaoSuportada;
}

export interface AudioTranscriptionResult {
  sucesso: boolean;
  textoOriginal: string;
  textoLimpo: string;
  comandoNormalizado: string;
  motor?: 'groq' | 'gemini';
  modelo?: string;
  erro?: string;
}

const GROQ_AUDIO_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const;

const GROQ_AUDIO_PROMPT =
  'Phone Center, Lucas Imports, iPhone, Pro Max, Plus, Mini, Galaxy, Xiaomi, Poco, Redmi, Motorola, GB, TB, IMEI, Pix, Fiado, Atacado, Varejo, Ordem de Serviço, Notinha, !fechamento, !emprestados, !estoque, !lista atacado, !modo, !vendas, !abater, !ajuda.';

const GEMINI_AUDIO_PROMPT = `Transcreva com máxima fidelidade o áudio em português do Brasil para um sistema de gestão de loja de celulares (Phone Center).
Termos comuns do contexto: iPhone, Pro Max, Plus, Mini, Galaxy, Xiaomi, Poco, Redmi, Motorola, 64GB, 128GB, 256GB, 512GB, 1TB, IMEI, Pix, Fiado, Atacado, Varejo, Notinha, fechamento, emprestados, estoque, modo vendas.
Regras:
- Retorne APENAS o texto exato falado no áudio, sem aspas, sem prefixos e sem markdown.
- Use algarismos para valores, quantidades, capacidades e IMEIs sempre que fizer sentido.
- Se não houver fala audível ou não for possível compreender o áudio, retorne exatamente VAZIO.`;

const MESES_PT_BR: Record<string, string> = {
  janeiro: '01',
  jan: '01',
  fevereiro: '02',
  fev: '02',
  marco: '03',
  mar: '03',
  abril: '04',
  abr: '04',
  maio: '05',
  mai: '05',
  junho: '06',
  jun: '06',
  julho: '07',
  jul: '07',
  agosto: '08',
  ago: '08',
  setembro: '09',
  set: '09',
  outubro: '10',
  out: '10',
  novembro: '11',
  nov: '11',
  dezembro: '12',
  dez: '12',
};

const AUDIO_TIMEOUT_MS = Math.max(TIMEOUT_IA_MS, 20000);

function removerAcentos(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function mapearMimeParaFormatoAudio(mime: string): {
  mimeType: string;
  extensao: AudioExtensaoSuportada;
} | null {
  const base = String(mime || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!base) return null;
  if (base === 'audio/ogg' || base === 'audio/opus' || base === 'application/ogg') {
    return { mimeType: 'audio/ogg', extensao: 'ogg' };
  }
  if (base === 'audio/mp4' || base === 'audio/m4a' || base === 'audio/x-m4a' || base === 'audio/aac') {
    return { mimeType: 'audio/mp4', extensao: 'm4a' };
  }
  if (base === 'audio/mpeg' || base === 'audio/mp3' || base === 'audio/mpga') {
    return { mimeType: 'audio/mpeg', extensao: 'mp3' };
  }
  if (base === 'audio/wav' || base === 'audio/wave' || base === 'audio/x-wav' || base === 'audio/vnd.wave') {
    return { mimeType: 'audio/wav', extensao: 'wav' };
  }
  if (base === 'audio/webm') {
    return { mimeType: 'audio/webm', extensao: 'webm' };
  }
  if (base === 'audio/flac' || base === 'audio/x-flac') {
    return { mimeType: 'audio/flac', extensao: 'flac' };
  }
  return null;
}

function detectarAudioPorMagicBytes(cleanBase64: string): {
  mimeType: string;
  extensao: AudioExtensaoSuportada;
} | null {
  const prefix = cleanBase64.slice(0, 32);
  if (prefix.startsWith('T2dnUw')) {
    return { mimeType: 'audio/ogg', extensao: 'ogg' };
  }
  if (prefix.startsWith('SUQz') || prefix.startsWith('//u') || prefix.startsWith('//s')) {
    return { mimeType: 'audio/mpeg', extensao: 'mp3' };
  }
  if (prefix.startsWith('UklGR')) {
    return { mimeType: 'audio/wav', extensao: 'wav' };
  }
  if (prefix.startsWith('GkXf')) {
    return { mimeType: 'audio/webm', extensao: 'webm' };
  }
  if (prefix.startsWith('ZkxBQ')) {
    return { mimeType: 'audio/flac', extensao: 'flac' };
  }
  if (prefix.includes('ZnR5c') || prefix.startsWith('AAAA')) {
    return { mimeType: 'audio/mp4', extensao: 'm4a' };
  }
  return null;
}

/**
 * Remove prefixo data URI de uma string Base64 de áudio e normaliza MIME type e extensão
 * para envio ao Groq Whisper e Google Gemini.
 */
export function limparBase64Audio(base64Data: string, mimeTypeHint?: string): LimparAudioResult {
  const bruto = String(base64Data || '').trim();
  let detectedDataUriMime = '';
  let cleanBase64 = bruto;

  const markerIdx = bruto.indexOf(';base64,');
  if (markerIdx !== -1 && /^data:/i.test(bruto.slice(0, markerIdx))) {
    detectedDataUriMime = bruto.slice(5, markerIdx);
    cleanBase64 = bruto.slice(markerIdx + 8);
  }

  cleanBase64 = cleanBase64.replace(/\s+/g, '');

  const formatoPorHint = mapearMimeParaFormatoAudio(mimeTypeHint || '');
  const formatoPorDataUri = mapearMimeParaFormatoAudio(detectedDataUriMime);
  const formatoPorBytes = detectarAudioPorMagicBytes(cleanBase64);

  const formato = formatoPorHint || formatoPorDataUri || formatoPorBytes || {
    mimeType: 'audio/ogg',
    extensao: 'ogg' as const,
  };

  return {
    cleanBase64,
    mimeType: formato.mimeType,
    extensao: formato.extensao,
  };
}

function normalizarDataFaladaParaFechamento(bruto: string): string | null {
  const s = bruto
    .replace(/^(?:do\s+dia|da\s+data|no\s+dia|dia|de|em)\s+/i, '')
    .replace(/[.!?;,]+$/g, '')
    .trim();

  if (!s || /^hoje$/i.test(s) || /^do\s+dia$/i.test(s) || /^di[aá]rio$/i.test(s)) {
    return '';
  }
  if (/^(?:de\s+)?ontem$/i.test(s)) return 'ontem';
  if (/^(?:de\s+)?anteontem$/i.test(s)) return 'anteontem';

  const matchBarra = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (matchBarra) {
    return matchBarra[0];
  }

  // Ex: "15 do 11", "15 do 11 de 2026"
  const matchDoNum = s.match(/^(\d{1,2})\s+do\s+(\d{1,2})(?:\s+(?:de|do)\s+(\d{2,4}))?$/i);
  if (matchDoNum) {
    return matchDoNum[3]
      ? `${matchDoNum[1]}/${matchDoNum[2]}/${matchDoNum[3]}`
      : `${matchDoNum[1]}/${matchDoNum[2]}`;
  }

  // Ex: "15 de novembro" ou "15 de novembro de 2026"
  const matchMesTexto = s.match(/^(\d{1,2})\s+de\s+([a-zçãõáéíóú]+)(?:\s+de\s+(\d{2,4}))?$/i);
  if (matchMesTexto) {
    const mesKey = removerAcentos(matchMesTexto[2].toLowerCase());
    const mesNum = MESES_PT_BR[mesKey];
    if (mesNum) {
      return matchMesTexto[3]
        ? `${matchMesTexto[1]}/${mesNum}/${matchMesTexto[3]}`
        : `${matchMesTexto[1]}/${mesNum}`;
    }
  }

  return null;
}

function resolverSubcomandoModo(rawModo: string): string | null {
  const clean = removerAcentos(rawModo.trim().toLowerCase());
  if (clean === 'vendas' || clean === 'venda' || clean === 'notinhas' || clean === 'notinha') return 'vendas';
  if (clean === 'estoque' || clean === 'stock') return 'estoque';
  if (clean === 'multiplo' || clean === 'lote' || clean === 'atacado') return 'multiplo';
  if (clean === 'padrao' || clean === 'normal' || clean === 'comandos' || clean === 'comando') return 'padrao';
  if (clean === 'completo' || clean === 'full' || clean === 'tudo') return 'completo';
  if (clean === 'teste' || clean === 'test' || clean === 'dev') return 'teste';
  if (clean === 'off' || clean === 'desativar' || clean === 'desativado' || clean === 'desligar' || clean === 'pausar' || clean === 'silencio') {
    return 'off';
  }
  if (clean === 'status' || clean === 'atual') return '';
  return null;
}

function normalizarComandoComExclamacao(cmdRaw: string): string {
  const limpo = cmdRaw
    .replace(/^!\s+/, '!')
    .replace(/[.!?;]+$/g, '')
    .trim();

  const matchModo = limpo.match(/^!(?:modo|config)\s+(.+)$/i);
  if (matchModo) {
    const sub = resolverSubcomandoModo(matchModo[1]);
    if (sub !== null) {
      return sub ? `!modo ${sub}` : '!modo';
    }
  }

  const matchFech = limpo.match(/^!(?:fechamento|fechamentodia|resumodia)\s+(.+)$/i);
  if (matchFech) {
    const dataNorm = normalizarDataFaladaParaFechamento(matchFech[1]);
    if (dataNorm !== null) {
      return dataNorm ? `!fechamento ${dataNorm}` : '!fechamento';
    }
  }

  return limpo;
}

/**
 * Normaliza uma transcrição de áudio falada para um comando determinístico (`!comando`)
 * ou para linguagem natural limpa compatível com o pipeline do bot.
 */
export function normalizarComandoFaladoParaBot(textoBruto: string): {
  textoLimpo: string;
  comandoNormalizado: string;
} {
  let textoLimpo = String(textoBruto || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“'«]+|["”'»]+$/g, '')
    .trim();

  if (!textoLimpo) {
    return { textoLimpo: '', comandoNormalizado: '' };
  }

  // Normaliza capacidades faladas em português para o padrão do sistema (ex: "256 gigas" -> "256GB")
  let trabalho = textoLimpo
    .replace(/\b(32|64|128|256|512)\s*(?:gigas?|gb)\b/gi, '$1GB')
    .replace(/\b(1|2)\s*(?:teras?|terabytes?|tb)\b/gi, '$1TB');

  // Remove vocativos iniciais ("Bot, ...", "Oi bot ...", "Astrogeek, ...") apenas se restar conteúdo
  const semVocativo = trabalho
    .replace(
      /^(?:(?:o+|e[iu]|fala|oi|ol[aá]|hey)\s+)?(?:bot|astrogeek|phone\s*center|rob[oô]|assistente)(?:\s*[,:.!?-]\s*|\s+)/i,
      ''
    )
    .trim();
  if (semVocativo) {
    trabalho = semVocativo;
  }

  // 1. Comando explícito já com `!` ou falado como "exclamação ..." / "ponto de exclamação ..." / "comando ..."
  if (trabalho.startsWith('!')) {
    return {
      textoLimpo,
      comandoNormalizado: normalizarComandoComExclamacao(trabalho),
    };
  }

  const matchExclamacaoFalada = trabalho.match(
    /^(?:(?:ponto\s+de\s+)?exclama[cç][aã]o|comando)\s+(.+)$/i
  );
  if (matchExclamacaoFalada && matchExclamacaoFalada[1].trim()) {
    const corpoCmd = matchExclamacaoFalada[1].trim().replace(/^[!\s]+/, '');
    return {
      textoLimpo,
      comandoNormalizado: normalizarComandoComExclamacao(`!${corpoCmd}`),
    };
  }

  const semPontuacaoFinal = trabalho.replace(/[.!?;,]+$/g, '').trim();

  // 2. Confirmação / Cancelamento explícito de notinha pendente via áudio
  if (
    /^(?:(?:pode|sim|ok|certo)\s+)*(?:confirma|confirmar|emite|emitir|aprova|aprovar|manda|mandar)\s+(?:a\s+)?(?:notinha|nota)(?:\s+(?:por\s+favor|agora|a[ií]))?$/i.test(
      semPontuacaoFinal
    )
  ) {
    return { textoLimpo, comandoNormalizado: 'confirmar' };
  }

  if (
    /^(?:(?:pode|n[aã]o|nao)\s+)*(?:cancela|cancelar|anula|anular)\s+(?:a\s+)?(?:notinha|nota)(?:\s+(?:por\s+favor|agora|a[ií]))?$/i.test(
      semPontuacaoFinal
    )
  ) {
    return { textoLimpo, comandoNormalizado: 'cancelar' };
  }

  // 3. Fechamento do dia (`!fechamento [data]`)
  const matchFechamento = semPontuacaoFinal.match(
    /^(?:(?:faz(?:er)?|manda(?:r)?|gera(?:r)?|tira(?:r)?|envia(?:r)?|mostra(?:r)?|puxa(?:r)?|ver|quero(?:\s+o)?)(?:\s+(?:o|um))?\s+)?(?:fechamento(?:\s+do\s+dia|\s+di[aá]rio)?|resumo\s+do\s+dia)(?:\s+(.+))?$/i
  );
  if (matchFechamento) {
    const complemento = matchFechamento[1]?.trim() || '';
    if (!complemento) {
      return { textoLimpo, comandoNormalizado: '!fechamento' };
    }
    const dataNorm = normalizarDataFaladaParaFechamento(complemento);
    if (dataNorm !== null) {
      return {
        textoLimpo,
        comandoNormalizado: dataNorm ? `!fechamento ${dataNorm}` : '!fechamento',
      };
    }
  }

  // 4. Aparelhos emprestados (`!emprestados`) — não intercepta frases de registrar/devolver empréstimo
  const ehPedidoListaEmprestados =
    /^(?:(?:ver|lista(?:r)?|mostra(?:r)?|manda(?:r)?|envia(?:r)?|puxa(?:r)?|checa(?:r)?|consulta(?:r)?)\s+(?:os\s+)?)?(?:(?:aparelhos?|celulares?|telefones?)\s+)?emprestados(?:\s+(?:no\s+momento|agora|hoje|a[ií]))?$/i.test(
      semPontuacaoFinal
    ) ||
    /^(?:quais|que)\s+(?:aparelhos?|celulares?|iphones?)\s+(?:est[aã]o|t[aã]o)\s+emprestados(?:\s+(?:agora|hoje|no\s+momento))?$/i.test(
      semPontuacaoFinal
    ) ||
    /^quem\s+(?:est[aá]|t[aá])\s+com\s+(?:aparelho|celular)\s+emprestado(?:\s+(?:agora|hoje))?$/i.test(
      semPontuacaoFinal
    ) ||
    /^(?:manda(?:r)?|mostra(?:r)?|ver|envia(?:r)?|lista(?:r)?)\s+(?:a\s+)?lista\s+de\s+(?:aparelhos?|celulares?)?\s*emprestados$/i.test(
      semPontuacaoFinal
    );
  if (ehPedidoListaEmprestados) {
    return { textoLimpo, comandoNormalizado: '!emprestados' };
  }

  // 5. Troca ou consulta de modo (`!modo <modo>`)
  const matchModoFalado = semPontuacaoFinal.match(
    /^(?:(?:coloca(?:r)?|muda(?:r)?|altera(?:r)?|troca(?:r)?|ativa(?:r)?|vai|volta(?:r)?|deixa(?:r)?|p[oõ]e|bota(?:r)?)(?:\s+(?:no|pro|para\s+o|para|o|em))?\s+)?modo\s+(vendas?|notinhas?|estoque|m[uú]ltiplo|multiplo|lote|padr[aã]o|padrao|normal|completo|full|tudo|teste|off|desativar|desativado|desligar|pausar|status|atual)$/i
  );
  if (matchModoFalado) {
    const modoResolvido = resolverSubcomandoModo(matchModoFalado[1]);
    if (modoResolvido !== null) {
      return {
        textoLimpo,
        comandoNormalizado: modoResolvido ? `!modo ${modoResolvido}` : '!modo',
      };
    }
  }

  if (
    /^(?:qual(?:\s+[ée]|\s+o)?|ver|mostra(?:r)?|checa(?:r)?|status\s+do)\s+(?:o\s+)?modo(?:\s+(?:do\s+(?:bot|chat)|atual))?$/i.test(
      semPontuacaoFinal
    )
  ) {
    return { textoLimpo, comandoNormalizado: '!modo' };
  }

  // 6. Lista de estoque / cardápio (`!estoque` / `!lista atacado` / `!estoque completo`)
  const matchListaEstoque = semPontuacaoFinal.match(
    /^(?:(?:manda(?:r)?|envia(?:r)?|gera(?:r)?|passa(?:r)?|ver|mostra(?:r)?|quero)\s+(?:o\s+|a\s+)?)?(?:lista(?:\s+(?:atualizada|de\s+estoque|do\s+estoque))?|estoque(?:\s+atualizado)?|card[aá]pio|tabela)(?:\s+(complet[ao]|(?:no\s+|de\s+|do\s+)?atacado|detalhad[ao]))?$/i
  );
  if (matchListaEstoque) {
    const qualificador = (matchListaEstoque[1] || '').toLowerCase();
    const isAtacado = qualificador.includes('atacado');
    const isCompleto = Boolean(qualificador) && !isAtacado;
    return {
      textoLimpo,
      comandoNormalizado: isAtacado
        ? '!lista atacado'
        : isCompleto
          ? '!estoque completo'
          : '!estoque',
    };
  }

  // 7. Menu de ajuda (`!ajuda`)
  if (
    /^(?:(?:ver|mostra(?:r)?|manda(?:r)?|abre|abrir)\s+(?:o\s+)?)?(?:menu(?:\s+de\s+ajuda)?|comandos(?:\s+dispon[ií]veis)?|ajuda(?:\s+do\s+bot)?)$/i.test(
      semPontuacaoFinal
    )
  ) {
    return { textoLimpo, comandoNormalizado: '!ajuda' };
  }

  return {
    textoLimpo,
    comandoNormalizado: trabalho,
  };
}

/**
 * Transcreve áudio via Groq Whisper (`whisper-large-v3-turbo` com fallback para `whisper-large-v3`).
 */
export async function transcribeAudioWithGroq(
  base64Data: string,
  mimeType?: string
): Promise<{ sucesso: boolean; texto?: string; modelo?: string; erro?: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { sucesso: false, erro: 'GROQ_API_KEY não configurada.' };
  }

  const { cleanBase64, mimeType: cleanMime, extensao } = limparBase64Audio(base64Data, mimeType);
  if (!cleanBase64) {
    return { sucesso: false, erro: 'Áudio Base64 vazio.' };
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(cleanBase64, 'base64');
  } catch {
    return { sucesso: false, erro: 'Base64 de áudio inválido.' };
  }

  if (audioBuffer.byteLength === 0) {
    return { sucesso: false, erro: 'Buffer de áudio vazio.' };
  }

  let ultimoErro = 'Falha ao transcrever com Groq Whisper.';

  for (const modelName of GROQ_AUDIO_MODELS) {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: cleanMime });
      formData.append('file', blob, `audio.${extensao}`);
      formData.append('model', modelName);
      formData.append('language', 'pt');
      formData.append('temperature', '0');
      formData.append('response_format', 'json');
      formData.append('prompt', GROQ_AUDIO_PROMPT);

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS),
        body: formData,
      });

      if (res.ok) {
        const data = await res.json().catch(() => null);
        const text = typeof data?.text === 'string' ? data.text.trim() : '';
        if (text) {
          return { sucesso: true, texto: text, modelo: modelName };
        }
        ultimoErro = `Groq ${modelName} retornou transcrição vazia.`;
      } else {
        const errText = await res.text().catch(() => res.statusText);
        ultimoErro = `Groq ${modelName} (${res.status}): ${errText.slice(0, 180)}`;
        console.warn(`⚠️ [GROQ AUDIO ERROR ${res.status}]:`, errText);
      }
    } catch (err: any) {
      ultimoErro = `Groq ${modelName}: ${err?.message || String(err)}`;
      console.warn(`⚠️ [GROQ AUDIO EXCEPTION - ${modelName}]:`, err?.message || err);
    }
  }

  return { sucesso: false, erro: ultimoErro };
}

/**
 * Transcreve áudio usando Google Gemini com `inlineData` (fallback quando Groq falha).
 */
export async function transcribeAudioWithGemini(
  base64Data: string,
  mimeType?: string
): Promise<{ sucesso: boolean; texto?: string; modelo?: string; erro?: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { sucesso: false, erro: 'GEMINI_API_KEY não configurada.' };
  }

  const { cleanBase64, mimeType: cleanMime } = limparBase64Audio(base64Data, mimeType);
  if (!cleanBase64) {
    return { sucesso: false, erro: 'Áudio Base64 vazio.' };
  }

  let ultimoErro = 'Falha ao transcrever com Gemini.';

  for (const modelName of MODELOS_GEMINI) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS),
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: GEMINI_AUDIO_PROMPT },
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              thinkingConfig: SEM_THINKING,
            },
          }),
        }
      );

      if (res.ok) {
        const responseData = await res.json().catch(() => null);
        const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text;
        const text = typeof rawText === 'string' ? rawText.trim() : '';
        if (text && !/^vazio$/i.test(text)) {
          return { sucesso: true, texto: text, modelo: modelName };
        }
        ultimoErro = `Gemini ${modelName} retornou transcrição vazia.`;
      } else {
        const errText = await res.text().catch(() => res.statusText);
        ultimoErro = `Gemini ${modelName} (${res.status}): ${errText.slice(0, 180)}`;
        console.warn(`⚠️ [GEMINI AUDIO ${modelName} ERROR ${res.status}]:`, errText);
      }
    } catch (err: any) {
      ultimoErro = `Gemini ${modelName}: ${err?.message || String(err)}`;
      console.warn(`⚠️ [GEMINI AUDIO EXCEPTION - ${modelName}]:`, err?.message || err);
    }
  }

  return { sucesso: false, erro: ultimoErro };
}

/**
 * Orquestra transcrição de áudio do WhatsApp (Groq Whisper primário -> Gemini fallback)
 * e aplica normalização para comandos do bot.
 */
export async function transcreverAudioWhatsApp(
  base64Data: string,
  mimeType?: string
): Promise<AudioTranscriptionResult> {
  const groqResult = await transcribeAudioWithGroq(base64Data, mimeType);
  if (groqResult.sucesso && groqResult.texto) {
    const { textoLimpo, comandoNormalizado } = normalizarComandoFaladoParaBot(groqResult.texto);
    if (comandoNormalizado) {
      return {
        sucesso: true,
        textoOriginal: groqResult.texto,
        textoLimpo,
        comandoNormalizado,
        motor: 'groq',
        modelo: groqResult.modelo,
      };
    }
  }

  const geminiResult = await transcribeAudioWithGemini(base64Data, mimeType);
  if (geminiResult.sucesso && geminiResult.texto) {
    const { textoLimpo, comandoNormalizado } = normalizarComandoFaladoParaBot(geminiResult.texto);
    if (comandoNormalizado) {
      return {
        sucesso: true,
        textoOriginal: geminiResult.texto,
        textoLimpo,
        comandoNormalizado,
        motor: 'gemini',
        modelo: geminiResult.modelo,
      };
    }
  }

  return {
    sucesso: false,
    textoOriginal: '',
    textoLimpo: '',
    comandoNormalizado: '',
    erro: [groqResult.erro, geminiResult.erro].filter(Boolean).join(' | ') || 'Não foi possível transcrever o áudio.',
  };
}
