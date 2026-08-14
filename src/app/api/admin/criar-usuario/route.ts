import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const { email, senha, nome, role, loja_id } = await request.json();

    if (!email || !senha) {
      return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha deve conter no mínimo 6 caracteres' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanNome = String(nome || cleanEmail.split('@')[0]).trim();
    const cleanRole = String(role || 'admin').trim();

    let userId: string | null = null;
    let authError: string | null = null;

    // 1. Tenta criar a conta no Supabase Auth via Admin Service Role API
    try {
      const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome: cleanNome,
          role: cleanRole,
          lojaId: loja_id || null,
          loja_id: loja_id || null,
        },
      });

      if (error) {
        authError = error.message;
      } else if (authUser?.user) {
        userId = authUser.user.id;
      }
    } catch (e: any) {
      authError = e?.message || 'Falha na criação de Auth via Admin SDK';
    }

    // 2. Fallback via signUp padrão caso Service Role não esteja disponível
    if (!userId) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: senha,
        options: {
          data: {
            nome: cleanNome,
            role: cleanRole,
            lojaId: loja_id || null,
            loja_id: loja_id || null,
          },
        },
      });

      if (signUpError && !signUpError.message.includes('User already registered')) {
        return NextResponse.json({ error: signUpError.message || authError || 'Erro ao criar conta de usuário' }, { status: 400 });
      }

      if (signUpData?.user) {
        userId = signUpData.user.id;
      }
    }

    // 3. Se ainda assim a conta de Auth já existir, buscar o ID na tabela perfis ou auth
    if (!userId) {
      const { data: perfilExistente } = await supabase
        .from('perfis')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (perfilExistente) {
        userId = perfilExistente.id;
      } else {
        // Gerar UUID para vincular o perfil
        userId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `user_${Date.now()}`;
      }
    }

    // 4. Salva ou atualiza a tabela 'perfis'
    const { data: perfilFinal, error: perfilError } = await supabase
      .from('perfis')
      .upsert({
        id: userId,
        email: cleanEmail,
        nome: cleanNome,
        role: cleanRole,
        loja_id: loja_id || null,
      }, { onConflict: 'email' })
      .select()
      .single();

    if (perfilError) {
      console.warn('Aviso ao atualizar perfil:', perfilError.message);
    }

    return NextResponse.json({
      success: true,
      message: `Usuário ${cleanEmail} criado e vinculado à loja com sucesso!`,
      usuario: {
        id: userId,
        email: cleanEmail,
        nome: cleanNome,
        role: cleanRole,
        loja_id: loja_id || null,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Erro na API de criação de usuário pelo SuperAdmin:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao criar usuário' }, { status: 500 });
  }
}
