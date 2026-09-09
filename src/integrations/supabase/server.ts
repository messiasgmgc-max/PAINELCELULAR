import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.DATABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.DATABASE_SERVICE_ROLE_KEY || "";

let clientInstance: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!clientInstance) {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Supabase admin não configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    clientInstance = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return clientInstance;
}

/**
 * Cliente admin (bypassa RLS). A instância só é criada no primeiro uso, para que
 * importar este módulo sem as variáveis de ambiente não derrube o processo inteiro.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabaseAdmin(), prop, receiver);
  },
});
