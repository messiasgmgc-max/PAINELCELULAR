import { supabaseAdmin } from '@/integrations/supabase/server';
import { sanitizarTextoWhatsApp } from './whatsappFormatting';

export interface EvolutionConfig {
  evolutionUrl: string;
  apiKey: string;
  instanceName: string;
}

/**
 * Normaliza a URL da Evolution API garantindo protocolo e porta correta
 */
export function getCleanEvolutionUrl(): string {
  let url = (process.env.EVOLUTION_API_URL || 'http://13.140.36.50:8080').trim().replace(/\/+$/, '');
  if (!url) return 'http://13.140.36.50:8080';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `http://${url}`;
  }

  if (url === 'http://13.140.36.50' || url === 'https://13.140.36.50') {
    url = 'http://13.140.36.50:8080';
  }

  return url;
}

/**
 * Formata um número para o padrão internacional do WhatsApp.
 * Suporta números do Brasil (adiciona 55 se vier com DDD de 10 ou 11 dígitos)
 * e números internacionais de qualquer país (EUA +1, Paraguai +595, Portugal +351, etc.).
 */
export function formatarTelefoneWhatsApp(numeroRaw: string): string {
  if (!numeroRaw) return '';
  const rawTrimmed = String(numeroRaw).trim();
  const comMais = rawTrimmed.startsWith('+');
  let limpo = rawTrimmed.replace(/\D/g, '');
  if (!limpo) return '';

  // 1. Se o usuário explicitamente colocou '+' no início, respeita o DDI internacional digitado
  if (comMais) {
    return limpo;
  }

  // 2. Se já começa com 55 e tem comprimento típico brasileiro (12 ou 13 dígitos)
  if (limpo.startsWith('55') && (limpo.length === 12 || limpo.length === 13)) {
    return limpo;
  }

  // 3. Se for número com 10 ou 11 dígitos típico do Brasil (DDD 11 a 99)
  const primeiroDigito = limpo.charAt(0);
  const segundoDigito = limpo.charAt(1);
  const pareceDDDBrasil = primeiroDigito >= '1' && primeiroDigito <= '9' && segundoDigito >= '1' && segundoDigito <= '9';

  // Se tem 11 dígitos (DDD + 9 dígitos começando com 9) e parece DDD BR
  if (limpo.length === 11 && pareceDDDBrasil && limpo.charAt(2) === '9') {
    return '55' + limpo;
  }
  // Se tem 10 dígitos (DDD + fixo) e parece DDD BR
  if (limpo.length === 10 && pareceDDDBrasil) {
    return '55' + limpo;
  }

  // 4. Se tem mais de 10 dígitos e não parece DDD local brasileiro, já é número internacional com DDI (ex: 1305..., 595981..., 351912...)
  if (limpo.length >= 10) {
    return limpo;
  }

  // Fallback padrão
  return limpo.length >= 8 ? '55' + limpo : limpo;
}

/**
 * Obtém as configurações e a instância ativa da Evolution API para a loja
 */
export async function getEvolutionConfig(lojaId?: string | null): Promise<EvolutionConfig> {
  const evolutionUrl = getCleanEvolutionUrl();
  const apiKey = (process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449').trim();
  let instanceName = (process.env.EVOLUTION_INSTANCE_NAME || 'lucasimports').trim();

  if (lojaId) {
    try {
      const { data: session } = await supabaseAdmin
        .from('whatsapp_sessions')
        .select('session_name, status')
        .eq('loja_id', lojaId)
        .maybeSingle();

      if (session?.session_name) {
        if (session.status === 'connected' || !session.session_name.startsWith('loja-')) {
          instanceName = session.session_name;
        }
      }
    } catch (e) {
      console.warn('[Evolution API] Aviso ao buscar sessão de WhatsApp da loja:', e);
    }
  }

  return { evolutionUrl, apiKey, instanceName };
}

/**
 * Envia mensagem de texto via Evolution API com retry automático para variações de 12 e 13 dígitos
 */
export async function enviarTextoWhatsApp({
  lojaId,
  telefone,
  texto,
}: {
  lojaId?: string | null;
  telefone: string;
  texto: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanPhone = formatarTelefoneWhatsApp(telefone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Telefone inválido ou não informado' };
  }

  const cleanTexto = sanitizarTextoWhatsApp(texto);
  const { evolutionUrl, apiKey, instanceName } = await getEvolutionConfig(lojaId);
  const endpoint = `${evolutionUrl}/message/sendText/${instanceName}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        number: cleanPhone,
        text: cleanTexto,
        options: { delay: 800, presence: 'composing' },
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    const errText = await res.text();
    console.warn(`[Evolution API] Primeira tentativa falhou para ${cleanPhone} (${res.status}): ${errText}`);

    // Fallback 1: se for 13 dígitos (55 + DDD + 9 + 8 dígitos), tenta sem o 9 (12 dígitos)
    if (cleanPhone.startsWith('55') && cleanPhone.length === 13) {
      const altPhone = cleanPhone.slice(0, 4) + cleanPhone.slice(5);
      try {
        const resAlt = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: altPhone,
            text: texto,
            options: { delay: 800, presence: 'composing' },
          }),
        });
        if (resAlt.ok) {
          return { success: true };
        }
      } catch (eAlt) {
        console.warn('[Evolution API] Falha no fallback de 12 dígitos:', eAlt);
      }
    }

    // Fallback 2: se for 12 dígitos (55 + DDD + 8 dígitos), tenta com o 9 inserido (13 dígitos)
    if (cleanPhone.startsWith('55') && cleanPhone.length === 12) {
      const altPhone = cleanPhone.slice(0, 4) + '9' + cleanPhone.slice(4);
      try {
        const resAlt = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiKey,
          },
          body: JSON.stringify({
            number: altPhone,
            text: texto,
            options: { delay: 800, presence: 'composing' },
          }),
        });
        if (resAlt.ok) {
          return { success: true };
        }
      } catch (eAlt) {
        console.warn('[Evolution API] Falha no fallback de 13 dígitos:', eAlt);
      }
    }

    return { success: false, error: `Evolution API (${res.status}): ${errText.slice(0, 150)}` };
  } catch (err: any) {
    console.error('[Evolution API] Erro ao enviar mensagem WhatsApp:', err);
    return { success: false, error: err.message || 'Erro de conexão com Evolution API' };
  }
}

/**
 * Envia um PDF como documento pela Evolution API (sendMedia), com as mesmas tentativas
 * de número com e sem o 9 do envio de texto.
 */
export async function enviarDocumentoWhatsApp({
  lojaId,
  telefone,
  base64,
  nomeArquivo,
  legenda,
}: {
  lojaId?: string | null;
  telefone: string;
  /** Conteúdo do PDF em base64, sem o prefixo data:. */
  base64: string;
  nomeArquivo: string;
  legenda?: string;
}): Promise<{ success: boolean; error?: string }> {
  const cleanPhone = formatarTelefoneWhatsApp(telefone);
  if (!cleanPhone || cleanPhone.length < 10) {
    return { success: false, error: 'Telefone inválido ou não informado' };
  }

  const { evolutionUrl, apiKey, instanceName } = await getEvolutionConfig(lojaId);
  const endpoint = `${evolutionUrl}/message/sendMedia/${instanceName}`;

  const numeros = [cleanPhone];
  if (cleanPhone.startsWith('55') && cleanPhone.length === 13) numeros.push(cleanPhone.slice(0, 4) + cleanPhone.slice(5));
  if (cleanPhone.startsWith('55') && cleanPhone.length === 12) numeros.push(cleanPhone.slice(0, 4) + '9' + cleanPhone.slice(4));

  let ultimoErro = '';
  for (const numero of numeros) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: apiKey },
        body: JSON.stringify({
          number: numero,
          mediatype: 'document',
          mimetype: 'application/pdf',
          fileName: nomeArquivo,
          caption: legenda ? sanitizarTextoWhatsApp(legenda) : '',
          media: base64,
        }),
      });
      if (res.ok) return { success: true };
      ultimoErro = `Evolution API (${res.status}): ${(await res.text()).slice(0, 150)}`;
      console.warn(`[Evolution API] Envio de documento falhou para ${numero}: ${ultimoErro}`);
    } catch (err: any) {
      ultimoErro = err?.message || 'Erro de conexão com Evolution API';
    }
  }
  return { success: false, error: ultimoErro };
}
