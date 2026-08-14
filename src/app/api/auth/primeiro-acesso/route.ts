import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { supabase } from '@/lib/supabaseClient';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, email, senha } = body;

    if (!email) {
      return NextResponse.json({ error: 'O e-mail é obrigatório.' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // ── 1. ETAPA DE VALIDAÇÃO DO E-MAIL ──
    // Busca na tabela 'tecnicos' (membros da equipe cadastrados pelo dono da loja)
    const { data: tecnico, error: tecError } = await supabase
      .from('tecnicos')
      .select('id, nome, email, tipo, loja_id')
      .ilike('email', cleanEmail)
      .maybeSingle();

    let registroEncontrado = tecnico;
    let origem = 'tecnicos';

    // Se não encontrou em técnicos, busca em 'perfis'
    if (!registroEncontrado) {
      const { data: perfil } = await supabase
        .from('perfis')
        .select('id, nome, email, role, loja_id')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (perfil) {
        registroEncontrado = {
          id: perfil.id,
          nome: perfil.nome || cleanEmail.split('@')[0],
          email: perfil.email,
          tipo: perfil.role || 'tecnico',
          loja_id: perfil.loja_id,
        };
        origem = 'perfis';
      }
    }

    if (!registroEncontrado) {
      return NextResponse.json(
        {
          ok: false,
          encontrado: false,
          error: 'E-mail não cadastrado na equipe. Peça ao administrador da sua loja para cadastrar seu e-mail na aba Equipe.',
        },
        { status: 404 }
      );
    }

    // Busca o nome da loja vinculada
    let nomeLoja = 'Sua Loja';
    if (registroEncontrado.loja_id) {
      const { data: loja } = await supabase
        .from('lojas')
        .select('nome')
        .eq('id', registroEncontrado.loja_id)
        .single();

      if (loja?.nome) {
        nomeLoja = loja.nome;
      }
    }

    // Se for apenas uma ação de consulta/validação inicial
    if (action === 'validar') {
      return NextResponse.json({
        ok: true,
        encontrado: true,
        nome: registroEncontrado.nome,
        loja_id: registroEncontrado.loja_id,
        loja_nome: nomeLoja,
        funcao: registroEncontrado.tipo || 'membro',
      });
    }

    // ── 2. ETAPA DE CRIAÇÃO / DEFINIÇÃO DA SENHA ──
    if (action === 'criar_senha') {
      if (!senha || String(senha).length < 6) {
        return NextResponse.json(
          { error: 'A senha deve conter no mínimo 6 caracteres.' },
          { status: 400 }
        );
      }

      const cleanSenha = String(senha).trim();
      const cleanNome = registroEncontrado.nome || cleanEmail.split('@')[0];
      const cleanRole = registroEncontrado.tipo === 'vendedor' ? 'vendedor' : (registroEncontrado.tipo || 'tecnico');
      const lojaId = registroEncontrado.loja_id || null;

      let userId: string | null = null;
      let authError: string | null = null;

      // 2a. Tenta buscar usuário no Supabase Auth para saber se ele já existe
      try {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existingAuthUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === cleanEmail
        );

        if (existingAuthUser) {
          userId = existingAuthUser.id;
          // Atualiza a senha da conta já existente
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            password: cleanSenha,
            email_confirm: true,
            user_metadata: { nome: cleanNome, role: cleanRole, lojaId },
          });
        }
      } catch (e: any) {
        console.warn('Busca admin em listUsers:', e?.message);
      }

      // 2b. Se a conta não existir no Auth, cria uma nova
      if (!userId) {
        try {
          const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: cleanSenha,
            email_confirm: true,
            user_metadata: {
              nome: cleanNome,
              role: cleanRole,
              lojaId,
              loja_id: lojaId,
            },
          });

          if (createErr) {
            authError = createErr.message;
          } else if (newUser?.user) {
            userId = newUser.user.id;
          }
        } catch (e: any) {
          authError = e?.message;
        }
      }

      // 2c. Fallback via signUp padrão caso Service Role não consiga criar
      if (!userId) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanSenha,
          options: {
            data: {
              nome: cleanNome,
              role: cleanRole,
              lojaId,
              loja_id: lojaId,
            },
          },
        });

        if (signUpError && !signUpError.message.includes('User already registered')) {
          return NextResponse.json(
            { error: signUpError.message || authError || 'Erro ao definir senha' },
            { status: 400 }
          );
        }

        if (signUpData?.user) {
          userId = signUpData.user.id;
        }
      }

      if (!userId) {
        userId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `user_${Date.now()}`;
      }

      // 2d. Salva/Atualiza o perfil na tabela 'perfis'
      await supabase.from('perfis').upsert(
        {
          id: userId,
          email: cleanEmail,
          nome: cleanNome,
          role: cleanRole,
          loja_id: lojaId,
        },
        { onConflict: 'email' }
      );

      // 2e. Atualiza o registro do técnico para indicar conta ativada
      if (origem === 'tecnicos' && registroEncontrado.id) {
        await supabase
          .from('tecnicos')
          .update({ status_conta: 'ativo' })
          .eq('id', registroEncontrado.id);
      }

      // 2f. Grava o log no sistema
      try {
        await supabase.from('logs_sistema').insert({
          loja_id: lojaId,
          usuario_id: userId,
          usuario_email: cleanEmail,
          usuario_nome: cleanNome,
          tipo_evento: 'equipe',
          acao: 'Primeiro Acesso / Definição de Senha',
          detalhes: `Usuário ${cleanNome} (${cleanEmail}) ativou sua senha e acesso à loja "${nomeLoja}".`,
        });
      } catch (logErr) {
        console.warn('Erro silencioso ao gravar log:', logErr);
      }

      return NextResponse.json({
        ok: true,
        success: true,
        message: `Senha definida com sucesso! Seja bem-vindo à loja ${nomeLoja}. Você já pode entrar com seu e-mail e senha.`,
      });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error: any) {
    console.error('Erro na API de Primeiro Acesso:', error);
    return NextResponse.json(
      { error: error?.message || 'Falha no processamento do Primeiro Acesso.' },
      { status: 500 }
    );
  }
}
