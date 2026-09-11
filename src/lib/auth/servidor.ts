import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { avaliarAcesso, ehSuperAdmin, tokenDaRequisicao, type RegrasAcesso, type UsuarioServidor } from './acesso';

/** Usuário logado da requisição, conferido no Supabase Auth e na tabela perfis. */
export async function obterUsuarioServidor(request: Request): Promise<UsuarioServidor | null> {
  const token = tokenDaRequisicao(request.headers.get('authorization'), request.headers.get('cookie'));
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = data?.user;
  if (error || !user?.email) return null;

  const email = user.email.toLowerCase();
  let { data: perfil } = await supabaseAdmin
    .from('perfis')
    .select('id, nome, role, loja_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!perfil) {
    ({ data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('id, nome, role, loja_id')
      .eq('email', email)
      .maybeSingle());
  }

  const role = String(perfil?.role || 'operador').toLowerCase();
  return {
    id: user.id,
    email,
    nome: perfil?.nome ?? null,
    role,
    lojaId: perfil?.loja_id ?? null,
    superAdmin: ehSuperAdmin(role, email),
  };
}

export type ResultadoAcesso =
  | { ok: true; usuario: UsuarioServidor }
  | { ok: false; resposta: NextResponse };

/**
 * Exige usuário logado e, conforme as regras, papel e loja.
 *   const acesso = await exigirAcesso(request, { lojaId });
 *   if (!acesso.ok) return acesso.resposta;
 */
export async function exigirAcesso(request: Request, regras: RegrasAcesso = {}): Promise<ResultadoAcesso> {
  const usuario = await obterUsuarioServidor(request);
  const decisao = avaliarAcesso(usuario, regras);
  if (!decisao.ok || !usuario) {
    const status = decisao.ok ? 401 : decisao.status;
    const erro = decisao.ok ? 'Entre de novo para continuar.' : decisao.erro;
    return { ok: false, resposta: NextResponse.json({ error: erro }, { status }) };
  }
  return { ok: true, usuario };
}
