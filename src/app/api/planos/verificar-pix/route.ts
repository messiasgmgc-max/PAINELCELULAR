import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { registrarLog } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');
    const lojaId = searchParams.get('lojaId');

    if (!paymentId || !lojaId) {
      return NextResponse.json({ error: 'paymentId e lojaId são obrigatórios' }, { status: 400 });
    }

    // 1. Buscar loja para obter o Access Token do Mercado Pago
    const { data: loja, error: lojaError } = await supabaseAdmin
      .from('lojas')
      .select('*')
      .eq('id', lojaId)
      .maybeSingle();

    if (lojaError || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    // Se a loja já estiver ativa com vencimento futuro, checar status
    const tokenMercadoPago = loja.mp_access_token || process.env.MERCADO_PAGO_ACCESS_TOKEN;

    // Se for ID numérico do Mercado Pago e temos token
    if (tokenMercadoPago && /^\d+$/.test(paymentId)) {
      try {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
          }
        });

        if (mpRes.ok) {
          const mpPayment = await mpRes.json();
          const status = mpPayment.status;

          if (status === 'approved') {
            // Pagamento APROVADO! Atualizar plano da loja e histórico
            const dataAtualVenc = loja.data_vencimento ? new Date(loja.data_vencimento) : new Date();
            const baseDate = dataAtualVenc > new Date() ? dataAtualVenc : new Date();
            const novoVencimento = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            await supabaseAdmin
              .from('lojas')
              .update({
                plano_status: 'ativo',
                data_vencimento: novoVencimento,
                solicitacao_liberacao_status: 'aprovado',
                ativo: true
              })
              .eq('id', lojaId);

            // Atualiza histórico
            await supabaseAdmin
              .from('historico_pagamentos_planos')
              .update({
                status: 'aprovado',
                observacao: `Aprovado via Mercado Pago PIX (ID: ${paymentId})`
              })
              .eq('mp_payment_id', paymentId);

            // Registra log do sistema
            await registrarLog({
              loja_id: lojaId,
              tipo_evento: 'plano',
              acao: 'Mensalidade Paga via PIX',
              detalhes: `Assinatura liberada automaticamente! Novo vencimento: ${novoVencimento} (MP ID: ${paymentId})`
            });

            return NextResponse.json({
              approved: true,
              status: 'approved',
              novoVencimento,
              message: 'Pagamento aprovado com sucesso! Sua loja já está liberada.'
            });
          }

          return NextResponse.json({
            approved: false,
            status: status,
            message: 'Aguardando pagamento pelo banco...'
          });
        }
      } catch (mpErr) {
        console.error('Erro ao consultar Mercado Pago:', mpErr);
      }
    }

    // Consulta no banco de dados se a cobrança foi aprovada no histórico
    let histQuery = supabaseAdmin
      .from('historico_pagamentos_planos')
      .select('status')
      .eq('loja_id', lojaId);

    if (paymentId && /^\d+$/.test(paymentId)) {
      histQuery = histQuery.eq('mp_payment_id', paymentId);
    } else if (paymentId && paymentId !== 'undefined' && paymentId !== 'null') {
      histQuery = histQuery.eq('id', paymentId);
    }

    const { data: hist } = await histQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const isAprovado = hist?.status === 'aprovado';

    return NextResponse.json({
      approved: isAprovado,
      status: hist?.status || 'pendente'
    });

  } catch (error: any) {
    console.error('Erro ao verificar status do PIX:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
}
