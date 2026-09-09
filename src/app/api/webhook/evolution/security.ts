import { createHash, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Segredo compartilhado do webhook. Configure a mesma string na Evolution API
 * (header `x-webhook-token`, header `apikey` ou query `?token=`) e em
 * EVOLUTION_WEBHOOK_SECRET aqui.
 *
 * Lido a cada chamada, e não no carregamento do módulo, para que a ordem de
 * inicialização do ambiente não silencie a proteção.
 */
function obterSegredoWebhook(): string {
  return (process.env.EVOLUTION_WEBHOOK_SECRET || '').trim();
}

export type ResultadoAutenticacao =
  | { autorizado: true; modo: 'verificado' | 'sem_segredo_configurado' }
  | { autorizado: false; motivo: string };

/** Comparação em tempo constante, tolerante a tamanhos diferentes. */
function compararSegredos(recebido: string, esperado: string): boolean {
  // O hash normaliza o tamanho, evitando que timingSafeEqual vaze o comprimento.
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Valida se a requisição veio mesmo da Evolution API.
 *
 * Sem esta checagem qualquer pessoa que descubra a URL pode forjar mensagens —
 * inclusive se passando pelo número do moderador master — e disparar vendas,
 * broadcasts e alterações de preço.
 *
 * Enquanto EVOLUTION_WEBHOOK_SECRET não estiver definido o webhook continua
 * aberto (para não derrubar instalações já em produção), mas registra um alerta
 * a cada requisição. Assim que a variável for definida, passa a recusar.
 */
export function autenticarWebhook(request: Request): ResultadoAutenticacao {
  const segredo = obterSegredoWebhook();
  if (!segredo) {
    console.warn(
      '🚨 [Segurança] EVOLUTION_WEBHOOK_SECRET não configurado: o webhook está ACEITANDO QUALQUER ORIGEM. ' +
        'Defina a variável e configure o mesmo valor na Evolution API (header x-webhook-token ou ?token= na URL).'
    );
    return { autorizado: true, modo: 'sem_segredo_configurado' };
  }

  const url = new URL(request.url);
  const candidatos = [
    request.headers.get('x-webhook-token'),
    request.headers.get('x-evolution-token'),
    request.headers.get('apikey'),
    url.searchParams.get('token'),
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  if (candidatos.length === 0) {
    return { autorizado: false, motivo: 'Token do webhook ausente.' };
  }

  const valido = candidatos.some((c) => compararSegredos(c.trim(), segredo));
  if (!valido) {
    return { autorizado: false, motivo: 'Token do webhook inválido.' };
  }

  return { autorizado: true, modo: 'verificado' };
}

/**
 * Marca a mensagem como processada. Retorna `false` quando ela já havia sido
 * processada antes (reentrega da Evolution API), e nesse caso o webhook deve
 * ser ignorado para não duplicar vendas/cadastros.
 *
 * Usa o PRIMARY KEY da tabela como trava: a corrida é resolvida pelo banco, não
 * por um cache em memória (que não funcionaria entre instâncias serverless).
 */
export async function registrarMensagemComoProcessada(
  supabase: SupabaseClient,
  messageId: string | null | undefined,
  contexto: { lojaId?: string | null; remoteJid?: string | null }
): Promise<boolean> {
  const id = String(messageId || '').trim();
  if (!id) {
    // Sem id não há como deduplicar; processa para não perder a mensagem.
    return true;
  }

  const { error } = await supabase.from('whatsapp_mensagens_processadas').insert({
    message_id: id,
    loja_id: contexto.lojaId || null,
    remote_jid: contexto.remoteJid || null,
  });

  if (!error) return true;

  // 23505 = unique_violation: já processada.
  if ((error as { code?: string }).code === '23505') {
    return false;
  }

  // Qualquer outra falha (tabela ausente, indisponibilidade) não pode travar o
  // bot: registra e segue processando.
  console.warn('[Idempotência] Falha ao registrar mensagem processada:', error.message);
  return true;
}
