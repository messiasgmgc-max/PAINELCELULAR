import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { TipoPlano, obterPlanoPorTipo } from '@/lib/planos-config';

export async function POST(request: Request) {
  try {
    const { lojaId, novoPlano } = await request.json();

    if (!lojaId || !novoPlano) {
      return NextResponse.json({ error: 'ID da loja e plano são obrigatórios' }, { status: 400 });
    }

    if (!['entrada', 'intermediario', 'avancado'].includes(novoPlano)) {
      return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });
    }

    // 1. Buscar dados atuais da loja
    const { data: loja, error: lojaError } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, plano_tipo, plano_status, data_vencimento, plano_trial_ate, trial_planos_usados')
      .eq('id', lojaId)
      .maybeSingle();

    if (lojaError || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const trialsUsados: string[] = Array.isArray(loja.trial_planos_usados) ? loja.trial_planos_usados : [];

    // Verificar se já usou teste desse plano específico
    if (trialsUsados.includes(novoPlano)) {
      return NextResponse.json({ 
        error: `Você já utilizou o teste gratuito de 3 dias do Plano ${obterPlanoPorTipo(novoPlano).nome}. Assine para continuar desfrutando de todos os recursos!` 
      }, { status: 400 });
    }

    // 3 dias a partir de agora
    const agora = new Date();
    const dataFimTrial = new Date(agora.getTime() + 3 * 24 * 60 * 60 * 1000);
    const dataFimIso = dataFimTrial.toISOString();
    const dataVencStr = dataFimIso.split('T')[0];

    // Se já tinha vencimento futuro maior, mantém o vencimento maior
    let vencimentoFinal = dataVencStr;
    if (loja.data_vencimento) {
      const parts = String(loja.data_vencimento).split('T')[0];
      if (parts > dataVencStr) {
        vencimentoFinal = parts;
      }
    }

    const novosTrials = [...trialsUsados, novoPlano];

    // Atualizar loja
    const { error: updateError } = await supabaseAdmin
      .from('lojas')
      .update({
        plano_tipo: novoPlano,
        plano_status: 'ativo',
        ativo: true,
        plano_trial_ate: dataFimIso,
        plano_trial_usado: true,
        trial_planos_usados: novosTrials,
        data_vencimento: vencimentoFinal,
        solicitacao_liberacao_status: 'aprovado'
      })
      .eq('id', lojaId);

    if (updateError) {
      throw updateError;
    }

    const nomePlanoFormatado = obterPlanoPorTipo(novoPlano).nome;

    // Inserir registro no histórico
    await supabaseAdmin.from('historico_pagamentos_planos').insert({
      loja_id: lojaId,
      valor: 0.00,
      status: 'aprovado',
      forma_pagamento: 'trial_gratis',
      metodo_pagamento: 'trial_3_dias',
      plano_contratado: novoPlano,
      observacao: `🎉 Teste gratuito de 3 dias ativado para o Plano ${nomePlanoFormatado}! Válido até ${dataFimTrial.toLocaleDateString('pt-BR')} às ${dataFimTrial.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    });

    return NextResponse.json({
      success: true,
      plano: novoPlano,
      nomePlano: nomePlanoFormatado,
      trialAte: dataFimIso,
      dataVencimento: vencimentoFinal,
      mensagem: `🎉 Parabéns! Seu teste de 3 dias do Plano ${nomePlanoFormatado} está ativo!`
    });

  } catch (err: any) {
    console.error('Erro ao solicitar trial de plano:', err);
    return NextResponse.json({ error: err.message || 'Erro ao ativar período de teste' }, { status: 500 });
  }
}
