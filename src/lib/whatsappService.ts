import { supabaseAdmin } from '@/integrations/supabase/server';

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
 * Formata um número bruto para o padrão internacional do WhatsApp (55 + DDD + Número)
 */
export function formatarTelefoneWhatsApp(numeroRaw: string): string {
  let limpo = (numeroRaw || '').replace(/\D/g, '');
  if (!limpo) return '';
  // Se for DDD + 8 ou 9 dígitos sem o DDI 55
  if (limpo.length === 10 || limpo.length === 11) {
    limpo = '55' + limpo;
  }
  return limpo;
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
        text: texto,
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
