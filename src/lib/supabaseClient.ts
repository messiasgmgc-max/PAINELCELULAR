import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltam variáveis de ambiente do Supabase');
}

const tabLocks = new Map<string, Promise<unknown>>();

/**
 * Lock por aba com timeout de segurança (substitui o navigator.locks global sem timeout).
 *
 * No Chrome/Safari mobile com várias abas abertas em segundo plano, o navegador pode
 * suspender uma aba enquanto ela segura o lock exclusivo do `navigator.locks`, fazendo
 * `supabase.auth.getSession()` (e todas as queries `.from()` / `.rpc()`) travarem
 * indefinidamente nas outras abas do mesmo domínio.
 */
async function safeTabLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>
): Promise<R> {
  const previous = tabLocks.get(name) ?? Promise.resolve();
  const timeoutMs = acquireTimeout > 0 ? acquireTimeout : 5000;

  let releaseCurrent!: () => void;
  const currentDone = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => currentDone);
  tabLocks.set(name, tail);

  try {
    await Promise.race([
      previous.catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    return await fn();
  } finally {
    releaseCurrent();
    if (tabLocks.get(name) === tail) {
      tabLocks.delete(name);
    }
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: safeTabLock,
  },
});