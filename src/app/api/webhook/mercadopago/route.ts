import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { registrarLog } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    let type = url.searchParams.get('type') || url.searchParams.get('topic');

    // Tentar ler do corpo JSON se não veio na URL
    if (!paymentId) {
      try {
        const body = await request.json();
        paymentId = body?.data?.id || body?.id;
        type = type || body?.type || body?.action;
      } catch {
        // Body não é JSON
      }
    }

    if (!paymentId) {
      return NextResponse.json({ message: 'Nenhum ID de pagamento recebido' }, { status: 200 });
    }

    // Buscar no histórico para saber qual loja gerou essa cobrança
    const { data: historico } = await supabaseAdmin
      .from('historico_pagamentos_planos')
      .select('*, lojas(*)')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle();

    const loja = historico?.lojas;
    const tokenMercadoPago = loja?.mp_access_token || process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!tokenMercadoPago) {
      console.warn('Webhook recebido mas nenhum Access Token configurado para consultar MP ID:', paymentId);
      return NextResponse.json({ message: 'Token não configurado' }, { status: 200 });
    }

    // Consultar detalhes na API do Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${tokenMercadoPago}`
      }
    });

    if (!mpRes.ok) {
      console.error('Falha ao consultar pagamento no Mercado Pago:', await mpRes.text());
      return NextResponse.json({ message: 'Falha ao validar com Mercado Pago' }, { status: 200 });
    }

    const mpPayment = await mpRes.json();
    const lojaId = mpPayment.external_reference || historico?.loja_id;

    if (!lojaId) {
      console.warn('Pagamento sem referência de loja:', paymentId);
      return NextResponse.json({ message: 'Sem referência de loja' }, { status: 200 });
    }

    if (mpPayment.status === 'approved') {
      // 1. Obter loja atual
      const { data: lojaAtual } = await supabaseAdmin
        .from('lojas')
        .select('*')
        .eq('id', lojaId)
        .maybeSingle();

      const dataAtualVenc = lojaAtual?.data_vencimento ? new Date(lojaAtual.data_vencimento) : new Date();
      const baseDate = dataAtualVenc > new Date() ? dataAtualVenc : new Date();
      const novoVencimento = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // 2. Liberar loja e renovar plano
      await supabaseAdmin
        .from('lojas')
        .update({
          plano_status: 'ativo',
          data_vencimento: novoVencimento,
          solicitacao_liberacao_status: 'aprovado',
          ativo: true
        })
        .eq('id', lojaId);

      // 3. Atualizar histórico
      await supabaseAdmin
        .from('historico_pagamentos_planos')
        .update({
          status: 'aprovado',
          observacao: `Aprovado via Webhook Mercado Pago (ID: ${paymentId})`
        })
        .eq('mp_payment_id', String(paymentId));

      // 4. Gravar log de auditoria
      await registrarLog({
        loja_id: lojaId,
        tipo_evento: 'plano',
        acao: 'Mensalidade Paga via Webhook PIX',
        detalhes: `Pagamento de R$ ${mpPayment.transaction_amount} confirmado automaticamente via Webhook. Novo vencimento: ${novoVencimento}`
      });

      console.log(`[Webhook MercadoPago] Loja ${lojaId} renovada com sucesso até ${novoVencimento}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Erro no Webhook Mercado Pago:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 200 });
  }
}
