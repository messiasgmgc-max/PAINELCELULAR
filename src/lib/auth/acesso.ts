/**
 * Regras de acesso das rotas da API, sem dependência de rede (testáveis).
 *
 * As rotas usam o cliente admin do Supabase, que ignora a RLS. Sem checagem,
 * qualquer pessoa na internet criava usuário, dava permissão de dono no bot,
 * lia a configuração fiscal ou disparava cobrança em nome de qualquer loja.
 */

export interface UsuarioServidor {
  id: string;
  email: string;
  nome: string | null;
  role: string;
  lojaId: string | null;
  superAdmin: boolean;
}

export interface RegrasAcesso {
  /** Loja que a requisição quer acessar. `undefined` = rota sem loja; `null`/'' = usar a do usuário. */
  lojaId?: string | null;
  /** Papéis aceitos (ex.: ['admin', 'gerente']). Super admin sempre passa. */
  papeis?: string[];
  /** Só o administrador da plataforma. */
  superAdmin?: boolean;
}

export type DecisaoAcesso =
  | { ok: true }
  | { ok: false; status: 401 | 403; erro: string };

/** E-mail do dono da plataforma, que também é super admin em checkIsSuperAdmin (src/lib/utils.ts). */
export const EMAILS_MESTRE = ['guiguigamer125@gmail.com'];

export const PAPEIS_GESTAO = ['admin', 'gerente'];

export function ehSuperAdmin(role: unknown, email: unknown): boolean {
  return String(role || '').toLowerCase() === 'super_admin' || EMAILS_MESTRE.includes(String(email || '').toLowerCase());
}

export function avaliarAcesso(usuario: UsuarioServidor | null, regras: RegrasAcesso = {}): DecisaoAcesso {
  if (!usuario) return { ok: false, status: 401, erro: 'Entre de novo para continuar.' };
  if (usuario.superAdmin) return { ok: true };
  if (regras.superAdmin) return { ok: false, status: 403, erro: 'Acesso restrito ao administrador da plataforma.' };

  if (regras.papeis && !regras.papeis.includes(usuario.role)) {
    return { ok: false, status: 403, erro: 'Seu usuário não tem permissão para esta ação.' };
  }

  if (regras.lojaId !== undefined) {
    if (!usuario.lojaId) return { ok: false, status: 403, erro: 'Seu usuário não está ligado a nenhuma loja.' };
    if (regras.lojaId && regras.lojaId !== usuario.lojaId) {
      return { ok: false, status: 403, erro: 'Esta loja não é a sua.' };
    }
  }

  return { ok: true };
}

/**
 * Loja efetiva da requisição: a informada, se o usuário for super admin; senão
 * sempre a do próprio usuário (ignora o que veio do navegador).
 */
export function lojaEfetiva(usuario: UsuarioServidor, informada: string | null | undefined): string | null {
  if (usuario.superAdmin) return informada || usuario.lojaId;
  return usuario.lojaId;
}

/** Token da sessão: cabeçalho Authorization ou o cookie `sessao_usuario` que o login grava. */
export function tokenDaRequisicao(cabecalhoAuthorization: string | null, cabecalhoCookie: string | null): string | null {
  const bearer = String(cabecalhoAuthorization || '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) return bearer;
  const cookie = String(cabecalhoCookie || '').match(/(?:^|;\s*)sessao_usuario=([^;]+)/);
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie[1]).trim() || null;
  } catch {
    return null;
  }
}
