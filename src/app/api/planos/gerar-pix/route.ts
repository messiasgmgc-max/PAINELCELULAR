import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lojaId, valor, email, nome } = body;

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    // Buscar dados da loja
    const { data: loja, error: lojaError } = await supabaseAdmin
      .from('lojas')
      .select('*')
      .eq('id', lojaId)
      .maybeSingle();

    if (lojaError || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const valorCobranca = Number(valor || loja.valor_mensalidade || 99.90);
    const tokenMercadoPago = loja.mp_access_token || process.env.MERCADO_PAGO_ACCESS_TOKEN;

    // Se temos credencial Mercado Pago configurada, gerar PIX dinâmico na API do Mercado Pago
    if (tokenMercadoPago) {
      try {
        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${lojaId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: valorCobranca,
            description: `Mensalidade Sistema - ${loja.nome || 'Loja'}`,
            payment_method_id: 'pix',
            payer: {
              email: email || 'cliente@painelcelular.com.br',
              first_name: nome || loja.nome || 'Assinante'
            },
            external_reference: lojaId,
            date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutos de validade
          })
        });

        const mpData = await mpResponse.json();

        if (mpResponse.ok && mpData.point_of_interaction?.transaction_data) {
          const txData = mpData.point_of_interaction.transaction_data;
          const paymentId = String(mpData.id);
          const qrCode = txData.qr_code;
          const qrCodeBase64 = txData.qr_code_base64;
          const ticketUrl = txData.ticket_url;

          // Grava no histórico de pagamentos
          await supabaseAdmin.from('historico_pagamentos_planos').insert({
            loja_id: lojaId,
            valor: valorCobranca,
            status: 'pendente',
            mp_payment_id: paymentId,
            qr_code: qrCode,
            qr_code_base64: qrCodeBase64,
            observacao: `PIX Mercado Pago gerado (ID: ${paymentId})`
          });

          return NextResponse.json({
            success: true,
            modo: 'mercadopago',
            paymentId,
            qrCode,
            qrCodeBase64,
            ticketUrl,
            valor: valorCobranca
          });
        } else {
          console.warn('Erro retornado pela API do Mercado Pago:', mpData);
        }
      } catch (mpErr: any) {
        console.error('Falha na requisição ao Mercado Pago:', mpErr);
      }
    }

    // Fallback: Chave PIX estática configurada na loja ou no sistema
    const chavePix = loja.chave_pix_cobranca || 'financeiro@phonecenter.com.br';
    
    // Registra tentativa/solicitação no histórico
    const { data: histRecord } = await supabaseAdmin
      .from('historico_pagamentos_planos')
      .insert({
        loja_id: lojaId,
        valor: valorCobranca,
        status: 'pendente',
        observacao: `Cobrança PIX gerada via chave oficial (${chavePix})`
      })
      .select('id')
      .maybeSingle();

    return NextResponse.json({
      success: true,
      modo: 'chave_pix',
      paymentId: histRecord?.id || 'manual',
      chavePix,
      valor: valorCobranca,
      mensagem: 'Para aprovação instantânea 100% automática, configure o Access Token do Mercado Pago no painel.'
    });

  } catch (error: any) {
    console.error('Erro ao gerar PIX:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao gerar PIX' }, { status: 500 });
  }
}
