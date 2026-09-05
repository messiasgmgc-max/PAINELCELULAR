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
    
    // 1. Tentar buscar token da própria loja
    let tokenMercadoPago = loja.mp_access_token?.trim();

    // 2. Se não tiver na própria loja, buscar de qualquer loja configurada no banco
    if (!tokenMercadoPago) {
      const { data: anyLojaWithMp } = await supabaseAdmin
        .from('lojas')
        .select('mp_access_token')
        .not('mp_access_token', 'is', null)
        .neq('mp_access_token', '')
        .limit(1)
        .maybeSingle();

      if (anyLojaWithMp?.mp_access_token) {
        tokenMercadoPago = anyLojaWithMp.mp_access_token.trim();
      }
    }

    // 3. Se ainda não tiver, buscar do process.env
    if (!tokenMercadoPago) {
      tokenMercadoPago = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    }

    // Se temos credencial Mercado Pago configurada, gerar PIX dinâmico na API do Mercado Pago
    if (tokenMercadoPago) {
      try {
        const payerEmail = (email && email.includes('@')) 
          ? email.trim() 
          : (loja.email && loja.email.includes('@')) 
            ? loja.email.trim() 
            : 'cliente@painelcelular.com.br';

        const payerName = (nome || loja.nome || 'Cliente').trim().slice(0, 30);

        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${lojaId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: Number(valorCobranca.toFixed(2)),
            description: `Mensalidade Sistema - ${(loja.nome || 'Loja').slice(0, 50)}`,
            payment_method_id: 'pix',
            payer: {
              email: payerEmail,
              first_name: payerName
            },
            external_reference: lojaId
          })
        });

        const mpData = await mpResponse.json().catch(() => ({}));

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
          // Erro retornado pela API do Mercado Pago - reportar claramente para o usuário
          const erroMp = mpData.message || mpData.cause?.[0]?.description || mpData.error || 'Credenciais ou parâmetros recusados pelo Mercado Pago';
          console.error('Erro detalhado retornado pelo Mercado Pago:', mpData);
          return NextResponse.json({
            error: `Mercado Pago: ${erroMp}`
          }, { status: 400 });
        }
      } catch (mpErr: any) {
        console.error('Falha na requisição ao Mercado Pago:', mpErr);
        return NextResponse.json({
          error: `Falha na conexão com Mercado Pago: ${mpErr?.message || 'Erro de rede'}`
        }, { status: 502 });
      }
    }

    // Fallback: Chave PIX estática configurada na loja ou no sistema quando não há credencial do Mercado Pago
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
      mensagem: 'Chave PIX manual gerada. Para liberação automática instantânea, salve o Access Token do Mercado Pago no painel Super Admin.'
    });

  } catch (error: any) {
    console.error('Erro ao gerar PIX:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao gerar PIX' }, { status: 500 });
  }
}
