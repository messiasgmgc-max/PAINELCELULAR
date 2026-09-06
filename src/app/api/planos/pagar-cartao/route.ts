import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { calcularValoresPlano, TipoPlano, PeriodoFaturamento } from '@/lib/planos-config';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      lojaId, 
      plano = 'entrada', 
      periodo = 'mensal', 
      email, 
      nome, 
      cardToken, 
      installments = 1,
      paymentMethodId = 'visa'
    } = body;

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    const { data: loja, error: lojaError } = await supabaseAdmin
      .from('lojas')
      .select('*')
      .eq('id', lojaId)
      .maybeSingle();

    if (lojaError || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    // Calcular valores do plano e período
    const planoInfo = calcularValoresPlano(plano as TipoPlano, periodo as PeriodoFaturamento);
    const valorCobranca = Number(planoInfo.valorTotal.toFixed(2));

    // Token Mercado Pago
    let tokenMercadoPago = loja.mp_access_token?.trim();
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
    if (!tokenMercadoPago) {
      tokenMercadoPago = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
    }

    if (!tokenMercadoPago) {
      return NextResponse.json({ 
        error: 'Chave de pagamento Mercado Pago não configurada no servidor. Entre em contato com o suporte.' 
      }, { status: 500 });
    }

    const payerEmail = (email && email.includes('@')) 
      ? email.trim() 
      : (loja.email && loja.email.includes('@')) 
        ? loja.email.trim() 
        : 'contato@phonecenter.com.br';

    const payerNome = (nome || loja.nome || 'Cliente').trim().slice(0, 45);
    const origin = request.headers.get('origin') || 'https://phonecenter.com.br';

    // OPÇÃO A: Se recebeu token direto de cartão gerado pelo MercadoPago.js
    if (cardToken) {
      const paymentPayload = {
        transaction_amount: valorCobranca,
        token: cardToken,
        description: `Phone Center ${planoInfo.nomePlano} (${periodo}) - ${loja.nome || 'Loja'}`,
        installments: Number(installments) || 1,
        payment_method_id: paymentMethodId,
        payer: {
          email: payerEmail,
          first_name: payerNome
        },
        external_reference: lojaId,
        statement_descriptor: 'PHONECENTER'
      };

      const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenMercadoPago}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `card-${lojaId}-${Date.now()}`
        },
        body: JSON.stringify(paymentPayload)
      });

      const mpData = await mpResponse.json();

      if (mpResponse.ok && mpData.status === 'approved') {
        // Renovar e ativar imediatamente
        const diasAdicionar = planoInfo.diasValidade;
        let baseDate = new Date();
        if (loja.data_vencimento) {
          const dVenc = new Date(loja.data_vencimento);
          if (dVenc.getTime() > baseDate.getTime()) {
            baseDate = dVenc;
          }
        }
        const novaDataMs = baseDate.getTime() + diasAdicionar * 24 * 60 * 60 * 1000;
        const novoVencimento = new Date(novaDataMs).toISOString().split('T')[0];

        await supabaseAdmin.from('lojas').update({
          plano_tipo: plano,
          plano_status: 'ativo',
          ativo: true,
          data_vencimento: novoVencimento,
          periodo_cobranca: periodo,
          valor_mensalidade: planoInfo.valorMensal,
          solicitacao_liberacao_status: 'aprovado'
        }).eq('id', lojaId);

        await supabaseAdmin.from('historico_pagamentos_planos').insert({
          loja_id: lojaId,
          valor: valorCobranca,
          status: 'aprovado',
          forma_pagamento: 'cartao_credito',
          metodo_pagamento: 'cartao_credito',
          cartao_ultimos_digitos: mpData.card?.last_four_digits,
          cartao_bandeira: mpData.payment_method_id,
          parcelas: Number(installments) || 1,
          plano_contratado: plano,
          periodo_contratado: periodo,
          mp_payment_id: String(mpData.id),
          observacao: `Cartão de Crédito aprovado na hora (ID: ${mpData.id}) - Plano ${planoInfo.nomePlano} renovado até ${novoVencimento}`
        });

        return NextResponse.json({
          success: true,
          status: 'approved',
          paymentId: mpData.id,
          novoVencimento,
          mensagem: 'Pagamento aprovado com sucesso!'
        });
      } else {
        const errorDetail = mpData.message || mpData.status_detail || 'Pagamento recusado pela operadora do cartão';
        return NextResponse.json({
          success: false,
          status: mpData.status || 'rejected',
          error: `Cartão Recusado: ${errorDetail}`
        }, { status: 400 });
      }
    }

    // OPÇÃO B: Criar Preferência do Mercado Pago Checkout Pro (suporta Cartão em até 12x com interface oficial e segura)
    const preferencePayload = {
      items: [
        {
          id: `plano-${plano}-${periodo}`,
          title: `Phone Center: Plano ${planoInfo.nomePlano} (${periodo.toUpperCase()})`,
          description: `Acesso completo ao Phone Center - Ciclo ${periodo} (${planoInfo.diasValidade} dias)`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: valorCobranca
        }
      ],
      payer: {
        email: payerEmail,
        name: payerNome
      },
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' } // Exclui boleto bancário demorado
        ],
        installments: 12
      },
      back_urls: {
        success: `${origin}/?checkout=sucesso&lojaId=${lojaId}`,
        failure: `${origin}/?checkout=erro&lojaId=${lojaId}`,
        pending: `${origin}/?checkout=pendente&lojaId=${lojaId}`
      },
      auto_return: 'approved',
      external_reference: lojaId,
      statement_descriptor: 'PHONECENTER',
      notification_url: `${origin}/api/webhook/mercadopago`
    };

    const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenMercadoPago}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(preferencePayload)
    });

    const prefData = await prefRes.json();

    if (!prefRes.ok || !prefData.id) {
      console.error('Erro ao gerar Preferência Mercado Pago:', prefData);
      return NextResponse.json({ 
        error: `Mercado Pago: ${prefData.message || 'Falha ao iniciar checkout com cartão'}` 
      }, { status: 400 });
    }

    // Registrar no histórico como pendente
    await supabaseAdmin.from('historico_pagamentos_planos').insert({
      loja_id: lojaId,
      valor: valorCobranca,
      status: 'pendente',
      forma_pagamento: 'cartao_credito',
      metodo_pagamento: 'cartao_credito',
      plano_contratado: plano,
      periodo_contratado: periodo,
      mp_preference_id: prefData.id,
      observacao: `Checkout Cartão de Crédito Mercado Pago iniciado (Pref: ${prefData.id}) - Plano ${planoInfo.nomePlano} (${periodo})`
    });

    return NextResponse.json({
      success: true,
      preferenceId: prefData.id,
      checkoutUrl: prefData.init_point,
      sandboxUrl: prefData.sandbox_init_point,
      valor: valorCobranca,
      plano: planoInfo.nomePlano,
      periodo
    });

  } catch (err: any) {
    console.error('Erro na rota de pagamento por cartão:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao processar pagamento por cartão' }, { status: 500 });
  }
}
