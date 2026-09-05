/**
 * Módulo de Análise e OCR de Imagens usando Groq (Qwen 3.6 27B Vision) + Google Gemini (Fallback)
 * Especializado em etiquetas de celulares, caixas, IMEIs e comprovantes bancários (Pix/TED).
 */

export interface VisionEtiquetaResult {
  tipo_documento: 'etiqueta_aparelho' | 'comprovante_pagamento' | 'outro';
  // Campos de Aparelho / Estoque:
  imei?: string | null;
  modelo?: string | null;
  capacidade?: string | null;
  cor?: string | null;
  saude_bateria?: number | string | null;
  preco?: number | null;
  codigo_etiqueta?: string | null;
  condicao?: 'novo' | 'seminovo' | 'usado' | null;
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
Analise a imagem fornecida com atenção aos detalhes do texto e números.

A imagem pode ser:
1. Uma ETIQUETA DE CELULAR, caixa ou adesivo de aparelho (iPhone, Xiaomi, Samsung, Motorola, etc.). Extraia:
{
  "tipo_documento": "etiqueta_aparelho",
  "modelo": "Nome do modelo (ex: iPhone 13, iPhone 14 Pro Max, Redmi Note 13)",
  "capacidade": "Capacidade de armazenamento (ex: 128GB, 256GB, 64GB) ou null",
  "cor": "Cor do aparelho (ex: Azul, Preto, Branco, Estelar, Dourado) ou null",
  "imei": "Número do IMEI com 15 dígitos numéricos (apenas dígitos) ou os dígitos legíveis",
  "saude_bateria": "Porcentagem da bateria se houver (número inteiro ex: 88 ou null)",
  "preco": "Valor numérico do preço se constar na etiqueta (ex: 2800.00 ou null)",
  "codigo_etiqueta": "Código interno, ID ou número do código de barras (ex: 8665041 ou null)",
  "condicao": "seminovo, novo ou usado se especificado"
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
- Limpe o IMEI para conter apenas números, sem barras ou hífens.
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

    // Tenta gemini-3.6-flash ou gemini-2.5-flash
    const modelosParaTestar = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

    for (const modelName of modelosParaTestar) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
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

/**
 * Normaliza os dados do retorno da IA para garantir consistência
 */
function normalizarResultadoVision(data: any): VisionEtiquetaResult {
  const result: VisionEtiquetaResult = {
    tipo_documento: data.tipo_documento || 'etiqueta_aparelho',
    ...data,
  };

  // Se tiver IMEI, limpa caracteres não-numéricos
  if (result.imei) {
    result.imei = String(result.imei).replace(/\D/g, '');
  }

  // Normaliza saúde da bateria
  if (result.saude_bateria !== undefined && result.saude_bateria !== null) {
    const batNum = parseInt(String(result.saude_bateria).replace(/\D/g, ''), 10);
    if (!isNaN(batNum) && batNum > 0 && batNum <= 100) {
      result.saude_bateria = batNum;
    }
  }

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
