import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { supabase } from '@/lib/supabaseClient';
import { calcularValoresPlano, TipoPlano, PeriodoFaturamento } from '@/lib/planos-config';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      nomeLoja,
      nomeProprietario,
      whatsapp,
      email,
      senha,
      plano = 'entrada',
      periodo = 'mensal',
      modalidade = 'trial', // 'trial' | 'pix' | 'cartao'
      cidade,
      estado,
      instagram
    } = body;

    // Validações básicas
    if (!nomeLoja?.trim() || !email?.trim() || !senha?.trim()) {
      return NextResponse.json({ error: 'Nome da loja, e-mail e senha são obrigatórios' }, { status: 400 });
    }

    if (senha.length < 6) {
      return NextResponse.json({ error: 'A senha deve conter no mínimo 6 caracteres' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanNomeLoja = String(nomeLoja).trim();
    const cleanNomeDono = String(nomeProprietario || cleanNomeLoja).trim();
    const cleanWhatsapp = String(whatsapp || '').replace(/\D/g, '');
    const planoEscolhido = (['entrada', 'intermediario', 'avancado'].includes(plano) ? plano : 'entrada') as TipoPlano;
    const periodoEscolhido = (['mensal', 'trimestral', 'anual'].includes(periodo) ? periodo : 'mensal') as PeriodoFaturamento;

    const infoPlano = calcularValoresPlano(planoEscolhido, periodoEscolhido);

    // 1. Criar Loja
    const agora = new Date();
    // Teste inicial de 3 dias para todos os novos clientes (liberação imediata de demonstração)
    const dataFimTrial = new Date(agora.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dataFimIso = dataFimTrial.toISOString();
    const vencimentoStr = dataFimIso.split('T')[0];

    // Gerar API Key segura se for plano avançado
    const apiKey = planoEscolhido === 'avancado' 
      ? `pk_live_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`
      : null;

    const { data: novaLoja, error: errLoja } = await supabaseAdmin
      .from('lojas')
      .insert({
        nome: cleanNomeLoja,
        email: cleanEmail,
        telefone: cleanWhatsapp,
        cidade: cidade?.trim() || null,
        estado: estado?.trim() || null,
        instagram: instagram?.trim() || null,
        plano_tipo: planoEscolhido,
        periodo_cobranca: periodoEscolhido,
        valor_mensalidade: infoPlano.valorMensal,
        data_vencimento: vencimentoStr,
        plano_trial_ate: dataFimIso,
        plano_trial_usado: true,
        trial_planos_usados: [planoEscolhido],
        plano_status: 'ativo',
        ativo: true,
        api_key: apiKey,
        configuracoes: {
          onboarding_completo: false,
          origem_cadastro: 'ads_landing_page'
        }
      })
      .select()
      .single();

    if (errLoja || !novaLoja) {
      console.error('Erro ao criar loja:', errLoja);
      return NextResponse.json({ error: 'Erro ao cadastrar loja no banco: ' + (errLoja?.message || '') }, { status: 500 });
    }

    const lojaId = novaLoja.id;

    // 2. Criar Usuário Administrador
    let userId: string | null = null;
    try {
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password: senha,
        email_confirm: true,
        user_metadata: {
          nome: cleanNomeDono,
          role: 'admin',
          lojaId: lojaId,
          loja_id: lojaId
        }
      });

      if (!authErr && authUser?.user) {
        userId = authUser.user.id;
      }
    } catch (e) {
      console.warn('Fallback de criação de usuário:', e);
    }

    if (!userId) {
      const { data: signUpData } = await supabase.auth.signUp({
        email: cleanEmail,
        password: senha,
        options: {
          data: {
            nome: cleanNomeDono,
            role: 'admin',
            lojaId: lojaId,
            loja_id: lojaId
          }
        }
      });
      userId = signUpData?.user?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `user_${Date.now()}`);
    }

    // Vincular perfil do dono
    await supabaseAdmin
      .from('perfis')
      .upsert({
        id: userId,
        email: cleanEmail,
        nome: cleanNomeDono,
        role: 'admin',
        loja_id: lojaId
      }, { onConflict: 'email' });

    // 3. Processar Pagamento conforme modalidade
    let checkoutData: any = {
      modalidade,
      lojaId,
      userId,
      trialAtivo: true,
      trialAte: dataFimIso
    };

    if (modalidade === 'trial') {
      // Registrar no histórico a ativação do teste
      await supabaseAdmin.from('historico_pagamentos_planos').insert({
        loja_id: lojaId,
        valor: 0.00,
        status: 'aprovado',
        forma_pagamento: 'trial_gratis',
        metodo_pagamento: 'trial_3_dias',
        plano_contratado: planoEscolhido,
        periodo_contratado: periodoEscolhido,
        observacao: `🎁 Cadastro de nova loja com Teste Grátis de 3 dias do Plano ${infoPlano.nomePlano}! Válido até ${vencimentoStr}`
      });
    }

    return NextResponse.json({
      success: true,
      lojaId,
      userId,
      plano: infoPlano.nomePlano,
      periodo: periodoEscolhido,
      valorTotal: infoPlano.valorTotal,
      dataVencimento: vencimentoStr,
      ...checkoutData,
      mensagem: 'Loja cadastrada com sucesso! Seu acesso de 3 dias já está liberado.'
    });

  } catch (err: any) {
    console.error('Erro na criação de loja com adesão:', err);
    return NextResponse.json({ error: err.message || 'Erro ao processar criação de loja' }, { status: 500 });
  }
}
