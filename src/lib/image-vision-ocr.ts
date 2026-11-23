/**
 * Módulo de Análise e OCR de Imagens usando Groq (Qwen 3.6 27B Vision) + Google Gemini (Fallback)
 * Especializado em etiquetas de celulares, caixas, IMEIs e comprovantes bancários (Pix/TED).
 */

export interface VisionEtiquetaResult {
  tipo_documento: 'etiqueta_aparelho' | 'etiqueta_caixa' | 'comprovante_pagamento' | 'outro';
  // Campos de Aparelho / Estoque:
  imei?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  saude_bateria?: number | string | null;
  preco?: number | null;
  codigo_etiqueta?: string | null;
  condicao?: 'novo' | 'seminovo' | 'usado' | 'danificado' | null;
  observacoes?: string | null;
  data_entrada?: string | null;
  texto_venda_visivel?: string | null;
  // Campos de Comprovante de Pagamento:
  amount?: number | null;
  modality?: string | null;
  machine_serial?: string | null;
  pagador_ou_recebedor?: string | null;
  raw_text_summary?: string;
  [key: string]: any;
}

/**
 * Valida a assinatura de bytes (Magic Bytes) da string Base64
 */
export function isValidImageBase64(base64Str: string): { isValid: boolean; detectedMime: string } {
  if (!base64Str || base64Str.length < 50) return { isValid: false, detectedMime: '' };

  let cleanPrefix = base64Str;
  if (cleanPrefix.includes(';base64,')) {
    cleanPrefix = cleanPrefix.split(';base64,')[1];
  }

  const prefix = cleanPrefix.slice(0, 30);
  if (prefix.startsWith('/9j/')) return { isValid: true, detectedMime: 'image/jpeg' };
  if (prefix.startsWith('iVBORw0KG')) return { isValid: true, detectedMime: 'image/png' };
  if (prefix.startsWith('UklGR')) return { isValid: true, detectedMime: 'image/webp' };
  if (prefix.startsWith('R0lGOD')) return { isValid: true, detectedMime: 'image/gif' };
  if (prefix.startsWith('JVBER')) return { isValid: true, detectedMime: 'application/pdf' };

  if (prefix.startsWith('PGh0bWw') || prefix.startsWith('PCFE') || prefix.startsWith('PD94bWw')) {
    return { isValid: false, detectedMime: 'text/html' };
  }

  // Se não foi identificado pelo prefixo estrito mas tem tamanho considerável de base64
  return { isValid: true, detectedMime: 'image/jpeg' };
}

const DEFAULT_VISION_PROMPT = `Você é um assistente de visão computacional de alta precisão para uma loja de celulares e assistência técnica.
Analise a imagem fornecida com atenção máxima tanto ao texto manuscrito/impresso das etiquetas quanto ao ESTADO FÍSICO E COR REAL do aparelho na foto.

A imagem pode ser:
1. Uma FOTO DE CELULAR, ETIQUETA DE CELULAR (manuscrita ou impressa), caixa ou adesivo de aparelho (iPhone, Xiaomi, Samsung, Motorola, etc.). Extraia:
{
  "tipo_documento": "etiqueta_aparelho",
  "modelo": "Nome padronizado do modelo. EXPANDA abreviações comuns de etiqueta manuscrita de loja: '16PM' ou '16 PM' -> 'iPhone 16 Pro Max', '15PM' -> 'iPhone 15 Pro Max', '15P' -> 'iPhone 15 Pro', '14PM' -> 'iPhone 14 Pro Max', '13PM' -> 'iPhone 13 Pro Max', '16e' -> 'iPhone 16e', '17 Air' -> 'iPhone 17 Air', '18PM' -> 'iPhone 18 Pro Max', '18P' -> 'iPhone 18 Pro'. NÃO inclua a capacidade (ex: 256) dentro do campo modelo. Se não houver modelo legível, retorne null (NUNCA invente geração).",
  "capacidade": "Capacidade de armazenamento com unidade (ex: '256' na etiqueta vira '256GB', '128' vira '128GB', '512' vira '512GB', '64' vira '64GB', '1TB' vira '1TB') ou null",
  "cor": "Cor do aparelho. Se não estiver escrita na etiqueta, IDENTIFIQUE visualmente a cor física do aparelho na foto (ex: 'Desert' para titânio deserto/dourado claro dos iPhones 16 Pro/Pro Max, 'Natural' para titânio natural/cinza claro, 'Azul' para titânio azul/azul, 'Preto', 'Branco', 'Roxo', 'Rosa', 'Verde', 'Dourado', 'Vermelho', 'Laranja') ou null",
  "imei": "Número do IMEI com 15 dígitos numéricos OU o final de 4 a 6 dígitos escrito na etiqueta (ex: '6147', '7887'). IMPORTANTE: se o número estiver cortado/ilegível com MENOS de 4 dígitos (ex: apenas 3 dígitos como '887'), retorne null — NUNCA chute nem retorne menos de 4 dígitos.",
  "saude_bateria": "Porcentagem da bateria se houver na etiqueta (número inteiro ex: 84 para '84%', ou null)",
  "preco": "Valor numérico do preço se constar na etiqueta (ex: 2800.00 ou null)",
  "codigo_etiqueta": "Código interno, ID ou número do código de barras (ex: 8665041 ou null)",
  "condicao": "seminovo, novo, usado ou danificado (use 'danificado' se houver avaria física grave visível como vidro traseiro ou tela quebrada)",
  "observacoes": "Observações curtas de defeito/avaria. Inspecione VISUALMENTE o aparelho na foto (ex: 'Traseira quebrada', 'Tela quebrada', 'Lente da câmera quebrada', 'Carcaça amassada') E também qualquer defeito escrito na etiqueta (ex: 'Traseira', 'Tela', 'Face ID off', 'BG', 'TG', 'Cam', 'Msg bateria'). Se não houver nenhum defeito visível nem anotado, retorne null.",
  "data_entrada": "Data de entrada se escrita em fita/etiqueta no aparelho (ex: 'ENTROU 21/11' -> '21/11', ou null)",
  "texto_venda_visivel": "Se a imagem for um print/captura de tela mostrando mensagem, legenda do WhatsApp ou anotação fora da etiqueta física com nome de comprador/lojista e/ou valor de venda (ex: 'GM 700', 'GM700', 'João 2500'), transcreva esse texto exato aqui; se for apenas a foto da etiqueta/aparelho sem texto de comprador externo, retorne null"
}

2. Um COMPROVANTE DE PAGAMENTO bancário (Pix, TED, Cartão de Crédito/Débito, Maquininha, etc.). Extraia:
{
  "tipo_documento": "comprovante_pagamento",
  "amount": 1250.00,
  "modality": "Pix, TED ou Cartão",
  "machine_serial": "Identificador da transação, TXID ou serial da máquina",
  "pagador_ou_recebedor": "Nome da pessoa ou empresa envolvida"
}

3. OUTRA IMAGEM ou documento genérico:
{
  "tipo_documento": "outro",
  "raw_text_summary": "Resumo do texto legível na imagem"
}

Regras Cruciais:
- Para valores monetários, retorne como float numérico puro (ex: R$ 3.200,00 vira 3200.00).
- Limpe o IMEI para conter apenas números, sem barras ou hífens. Se tiver menos de 4 dígitos, retorne null.
- Em etiquetas de 4 cantos (ex: '16PM  256' em cima, '84%  6147' embaixo), reconheça cada campo separadamente (modelo, capacidade, bateria, imei).
- Retorne ESTRITAMENTE um JSON válido, sem tags markdown ou comentários.`;

/**
 * Analisa a imagem usando a API do Groq Vision (Qwen 3.6 27B) - Motor Primário (~300ms)
 */
export async function analyzeImageWithGroq(
  base64Data: string,
  mimeType: string,
  customPrompt?: string
): Promise<VisionEtiquetaResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [GROQ] Chave GROQ_API_KEY não configurada no .env.local.');
    return null;
  }

  try {
    let cleanBase64 = base64Data;
    if (base64Data.includes(';base64,')) {
      cleanBase64 = base64Data.split(';base64,')[1];
    }

    let targetMime = mimeType;
    if (targetMime.includes('pdf')) {
      // Groq não processa PDF direto via image_url
      return null;
    }
    if (!targetMime.startsWith('image/')) {
      targetMime = 'image/jpeg';
    }

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: customPrompt || DEFAULT_VISION_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${targetMime};base64,${cleanBase64}`,
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        // Sem raciocínio: com ele o Qwen gastava os 600 tokens pensando e não fechava o JSON
        // (erro json_validate_failed), e toda foto caía no Gemini. A conta gratuita limita
        // a 1000 tokens de saída por minuto, então subir o max_tokens não resolve.
        reasoning_effort: 'none',
        max_tokens: 600,
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`⚠️ [GROQ API ERROR ${res.status}]:`, errorText);
      return null;
    }

    const responseData = await res.json();
    const textResponse = responseData.choices?.[0]?.message?.content;

    if (textResponse) {
      const parsed = JSON.parse(textResponse.trim());
      return normalizarResultadoVision(parsed);
    }
  } catch (err: any) {
    console.error('❌ [GROQ EXCEPTION]:', err.message || err);
  }
  return null;
}

/**
 * Analisa a imagem/PDF usando a API do Google Gemini (Fallback)
 */
export async function analyzeImageWithGemini(
  base64Data: string,
  mimeType: string,
  customPrompt?: string
): Promise<VisionEtiquetaResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [GEMINI] Chave GEMINI_API_KEY não configurada no .env.local.');
    return null;
  }

  try {
    let cleanBase64 = base64Data;
    if (base64Data.includes(';base64,')) {
      cleanBase64 = base64Data.split(';base64,')[1];
    }

    let geminiMime = mimeType;
    if (geminiMime.includes('pdf')) {
      geminiMime = 'application/pdf';
    } else if (!geminiMime.startsWith('image/')) {
      geminiMime = 'image/jpeg';
    }

    // Modelos com visão, na ordem medida contra esta chave. Os antigos
    // (gemini-2.5-flash, 2.0-flash, 1.5-flash) respondem 404 aqui: toda foto de
    // etiqueta gastava 3 requisições perdidas antes de chegar num que funciona.
    const modelosParaTestar = [
      'gemini-3.1-flash-lite',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-flash-latest',
    ];

    for (const modelName of modelosParaTestar) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(12000),
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: customPrompt || DEFAULT_VISION_PROMPT,
                  },
                  {
                    inlineData: {
                      mimeType: geminiMime,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (res.ok) {
        const responseData = await res.json();
        const textResponse = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResponse) {
          const parsed = JSON.parse(textResponse.trim());
          return normalizarResultadoVision(parsed);
        }
      } else {
        const errorText = await res.text();
        console.warn(`⚠️ [GEMINI ${modelName} ERROR ${res.status}]:`, errorText);
      }
    }
  } catch (err: any) {
    console.error('❌ [GEMINI EXCEPTION]:', err.message || err);
  }
  return null;
}

const REGEX_VALOR_NULO_TEXTO = /^(?:null|undefined|none|n\/?a|nenhum|nenhuma|sem\s+observa[cç][oõ]es?|sem\s+detalhes?|n[aã]o\s+informad[oa]|n[aã]o\s+identificad[oa]|-)$/i;

function limparTextoVision(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).replace(/\s+/g, ' ').trim();
  if (!limpo || REGEX_VALOR_NULO_TEXTO.test(limpo)) return null;
  return limpo;
}

export function normalizarCapacidadeVision(capBruta: unknown): string | null {
  const limpo = limparTextoVision(capBruta);
  if (!limpo) return null;
  const matchTb = limpo.match(/^([12])\s*(?:tb|t|teras?)$/i) || limpo.match(/^(1024)\s*(?:gb|g)?$/i);
  if (matchTb) {
    return matchTb[1] === '1024' ? '1TB' : `${matchTb[1]}TB`;
  }
  const matchGb = limpo.match(/^(32|64|128|256|512)\s*(?:gb|g|gigas?)?$/i);
  if (matchGb) {
    return `${matchGb[1]}GB`;
  }
  return limpo.toUpperCase().replace(/\s+/g, '');
}

export function expandirModeloEtiqueta(modeloBruto: string): {
  modelo: string;
  capacidadeExtraida?: string;
} {
  let texto = String(modeloBruto || '').replace(/\s+/g, ' ').trim();
  let capacidadeExtraida: string | undefined;

  // Extrai capacidade colada/embutida no campo modelo (ex: "15PM 256", "16PM 256GB", "iPhone 16 Pro Max 1TB")
  const matchCapTb = texto.match(/\b([12])\s*(?:tb|tera)\b/i);
  if (matchCapTb) {
    capacidadeExtraida = `${matchCapTb[1]}TB`;
    texto = texto.replace(matchCapTb[0], ' ');
  } else {
    const matchCapGb = texto.match(/\b(32|64|128|256|512)\s*(?:gb|g)?\b/i);
    if (matchCapGb) {
      capacidadeExtraida = `${matchCapGb[1]}GB`;
      texto = texto.replace(matchCapGb[0], ' ');
    }
  }

  texto = texto.replace(/\s+/g, ' ').trim();

  // Expande abreviações manuscritas de etiqueta de loja de iPhone (ex: 16PM, 15PM, 15P, 14PM, 16E, 18PM, 18P)
  const ehOutraMarca = /\b(samsung|galaxy|xiaomi|redmi|poco|motorola|moto|edge|realme|ipad|watch|macbook|airpods?|ps5|ps4|xbox)\b/i.test(texto);
  if (!ehOutraMarca) {
    const matchSigla = texto.match(
      /^(?:apple\s+)?(?:iphone\s+|ip\s+)?(2\d|1\d|[7-8])\s*(pm|p\s*max|promax|pro\s*max|pro|p|plus|\+|air|mini|m|e)?$/i
    );
    if (matchSigla) {
      const geracao = matchSigla[1];
      const suf = (matchSigla[2] || '').toLowerCase().replace(/\s+/g, '');
      let sufixoNorm = '';
      if (suf === 'pm' || suf === 'pmax' || suf === 'promax') sufixoNorm = ' Pro Max';
      else if (suf === 'p' || suf === 'pro') sufixoNorm = ' Pro';
      else if (suf === 'plus' || suf === '+') sufixoNorm = ' Plus';
      else if (suf === 'air') sufixoNorm = ' Air';
      else if (suf === 'mini' || suf === 'm') sufixoNorm = ' Mini';
      else if (suf === 'e') sufixoNorm = 'e';
      texto = `iPhone ${geracao}${sufixoNorm}`;
    } else {
      const matchX = texto.match(/^(?:apple\s+)?(?:iphone\s+|ip\s+)?(xs\s*max|xs|xr|x|se(?:\s*[23])?)$/i);
      if (matchX) {
        const tok = matchX[1].toUpperCase().replace(/\s+/g, ' ').trim();
        texto = `iPhone ${tok === 'XS MAX' ? 'XS Max' : tok}`;
      }
    }
  }

  return {
    modelo: texto.replace(/\s+/g, ' ').trim(),
    ...(capacidadeExtraida ? { capacidadeExtraida } : {}),
  };
}

function normalizarCorVision(corBruta: unknown): string | null {
  const limpo = limparTextoVision(corBruta);
  if (!limpo) return null;
  const lower = limpo.toLowerCase();
  if (lower.includes('desert') || lower.includes('deserto')) return 'Desert';
  if (lower.includes('natural')) return 'Natural';
  return limpo;
}

/**
 * Normaliza os dados do retorno da IA para garantir consistência
 */
export function normalizarResultadoVision(data: any): VisionEtiquetaResult {
  const result: VisionEtiquetaResult = {
    tipo_documento: data.tipo_documento || 'etiqueta_aparelho',
    ...data,
  };

  // Normaliza modelo e expande siglas manuscritas (ex: "15PM 256" -> "iPhone 15 Pro Max" + "256GB")
  const modeloLimpo = limparTextoVision(result.modelo);
  if (modeloLimpo) {
    const { modelo, capacidadeExtraida } = expandirModeloEtiqueta(modeloLimpo);
    result.modelo = modelo || null;
    if (!limparTextoVision(result.capacidade) && capacidadeExtraida) {
      result.capacidade = capacidadeExtraida;
    }
  } else {
    result.modelo = null;
  }

  // Normaliza capacidade (ex: "256" -> "256GB")
  result.capacidade = normalizarCapacidadeVision(result.capacidade);

  // Normaliza cor
  result.cor = normalizarCorVision(result.cor);

  // Valida IMEI: aceita 4–6 dígitos (final na etiqueta) ou 14–16 dígitos (IMEI completo).
  // Descarta fragmentos cortados (< 4 dígitos, como "887") para nunca poluir venda ou busca.
  if (result.imei !== undefined && result.imei !== null) {
    const imeiDigits = String(result.imei).replace(/\D/g, '');
    if ((imeiDigits.length >= 4 && imeiDigits.length <= 6) || (imeiDigits.length >= 14 && imeiDigits.length <= 16)) {
      result.imei = imeiDigits;
    } else {
      result.imei = null;
    }
  } else {
    result.imei = null;
  }

  // Normaliza saúde da bateria
  if (result.saude_bateria !== undefined && result.saude_bateria !== null) {
    const batNum = parseInt(String(result.saude_bateria).replace(/\D/g, ''), 10);
    result.saude_bateria = !isNaN(batNum) && batNum > 0 && batNum <= 100 ? batNum : null;
  } else {
    result.saude_bateria = null;
  }

  // Normaliza observações (defeito físico visível ou anotado na etiqueta) e data de entrada
  result.observacoes = limparTextoVision(result.observacoes);
  result.data_entrada = limparTextoVision(result.data_entrada);
  result.codigo_etiqueta = limparTextoVision(result.codigo_etiqueta);
  result.texto_venda_visivel = limparTextoVision(result.texto_venda_visivel);

  // Normaliza preço
  if (result.preco !== undefined && result.preco !== null) {
    const p = parseFloat(String(result.preco).replace(/[^\d.,]/g, '').replace(',', '.'));
    result.preco = !isNaN(p) && p > 0 ? p : null;
  }

  // Normaliza amount de comprovante
  if (result.amount !== undefined && result.amount !== null) {
    const a = parseFloat(String(result.amount).replace(/[^\d.,]/g, '').replace(',', '.'));
    result.amount = !isNaN(a) && a > 0 ? a : null;
  }

  return result;
}

/**
 * Função Principal com Orquestração e Fallback Automático
 */
export async function processImageVision(
  base64Data: string,
  mimeType: string = 'image/jpeg',
  customPrompt?: string
): Promise<VisionEtiquetaResult | null> {
  // 1. Validar Assinatura do Base64
  const check = isValidImageBase64(base64Data);
  if (!check.isValid && !mimeType.includes('pdf')) {
    throw new Error(`Base64 de imagem inválido ou corrompido (Tipo detectado: ${check.detectedMime || 'desconhecido'})`);
  }

  const effectiveMime = check.detectedMime || mimeType;

  // 2. Tentar Leitura Direta pelo Groq Vision (Qwen 3.6 27B)
  let result = await analyzeImageWithGroq(base64Data, effectiveMime, customPrompt);

  // 3. Fallback para Google Gemini caso Groq retorne nulo ou seja um PDF
  if (!result) {
    console.log('🔄 [FALLBACK] Groq indisponível ou arquivo é PDF. Executando leitura via Google Gemini Vision...');
    result = await analyzeImageWithGemini(base64Data, effectiveMime, customPrompt);
  }

  return result;
}
