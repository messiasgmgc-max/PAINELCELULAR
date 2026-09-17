import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarAvisoVencimentoPlanoEmail } from '@/lib/email/emailService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Cron diário para verificar vencimento dos planos das lojas.
 * Envia avisos quando faltam 7 dias, 3 dias, 1 dia, no dia do vencimento ou plano vencido.
 * Rota protegida por CRON_SECRET no cabeçalho Authorization ou query param secret.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const segredo = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const secretParam = searchParams.get('secret');

  const isAutorizado =
    !segredo ||
    authHeader === `Bearer ${segredo}` ||
    secretParam === segredo;

  if (!isAutorizado) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  try {
    const { data: lojas, error: erroLojas } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, email, data_vencimento, plano_status, plano, configuracoes, ativo')
      .neq('ativo', false);

    if (erroLojas) throw erroLojas;

    const agora = new Date();
    const resultados = [];

    for (const loja of lojas || []) {
      if (loja.plano_status === 'vitalicio') continue;
      if (!loja.data_vencimento) continue;

      const dataVenc = new Date(loja.data_vencimento);
      if (isNaN(dataVenc.getTime())) continue;

      // Diferença em dias
      const diffMs = dataVenc.getTime() - agora.getTime();
      const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Dispara nos marcos: 7 dias, 3 dias, 1 dia, 0 dias (hoje) ou -1 (acabou de vencer)
      const deveAvisar = [7, 3, 1, 0, -1].includes(diffDias);

      if (!deveAvisar) continue;

      // Busca o e-mail do proprietário da loja
      let emailDestino = loja.email;
      if (!emailDestino) {
        const { data: perfilDono } = await supabaseAdmin
          .from('perfis')
          .select('email')
          .eq('loja_id', loja.id)
          .in('role', ['admin', 'proprietario', 'gerente'])
          .limit(1)
          .maybeSingle();

        emailDestino = perfilDono?.email;
      }

      if (!emailDestino) continue;

      const dataVencFormatada = dataVenc.toLocaleDateString('pt-BR');
      const resEnvio = await enviarAvisoVencimentoPlanoEmail({
        para: emailDestino,
        nomeLoja: loja.nome || 'Minha Loja',
        diasRestantes: diffDias,
        dataVencimento: dataVencFormatada,
      });

      resultados.push({
        lojaId: loja.id,
        lojaNome: loja.nome,
        email: emailDestino,
        diasRestantes: diffDias,
        sucesso: resEnvio.success,
      });
    }

    return NextResponse.json({
      ok: true,
      data: agora.toISOString(),
      totalLojasVerificadas: (lojas || []).length,
      avisosEnviados: resultados.length,
      detalhes: resultados,
    });
  } catch (err: any) {
    console.error('Erro no cron de verificação de planos:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao processar verificação de planos.' }, { status: 500 });
  }
}
