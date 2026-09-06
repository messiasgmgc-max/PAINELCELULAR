import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { calcularValoresPlano, TipoPlano, PeriodoFaturamento, obterPlanoPorTipo } from '@/lib/planos-config';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lojaId, valor, email, nome, plano, periodo } = body;

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

    const planoEscolhido = (plano || loja.plano_tipo || 'entrada') as TipoPlano;
    const periodoEscolhido = (periodo || loja.periodo_cobranca || 'mensal') as PeriodoFaturamento;
    const infoPlano = calcularValoresPlano(planoEscolhido, periodoEscolhido);

    // Calcular dias restantes e se é renovação antecipada proporcional
    let diasRestantes = 0;
    if (loja.data_vencimento) {
      const parts = String(loja.data_vencimento).split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const venc = new Date(year, month, day, 23, 59, 59, 999);
        const diffTime = venc.getTime() - Date.now();
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }

    const valorMensalBase = infoPlano.valorMensal;
    const valorDiaria = valorMensalBase / 30;

    let valorCalculado = infoPlano.valorTotal;
    let diasCobrados = infoPlano.diasValidade;
    let isProporcional = false;

    // Se é ciclo mensal e ainda restam dias (ex: 10 dias) e o plano está ativo, cobra somente os dias para completar 30 dias (se mesmo plano)
    if (periodoEscolhido === 'mensal' && planoEscolhido === (loja.plano_tipo || 'entrada') && diasRestantes > 0 && diasRestantes < 30 && (loja.plano_status === 'ativo' || !loja.plano_status)) {
      diasCobrados = 30 - diasRestantes;
      valorCalculado = Math.max(1.00, Number((diasCobrados * valorDiaria).toFixed(2)));
      isProporcional = true;
    }

    const valorCobranca = valor ? Number(Number(valor).toFixed(2)) : valorCalculado;
    
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

        const descricaoCobranca = isProporcional
          ? `Renovação Parcial (${diasCobrados} dias) - ${(loja.nome || 'Loja').slice(0, 30)}`
          : `Mensalidade Sistema - ${(loja.nome || 'Loja').slice(0, 30)}`;

        const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenMercadoPago}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${lojaId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: Number(valorCobranca.toFixed(2)),
            description: descricaoCobranca,
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

          const obsHistorico = isProporcional
            ? `PIX Mercado Pago gerado (ID: ${paymentId}) - Renovação Proporcional de ${diasCobrados} dias (restavam ${diasRestantes} dias) | Plano: ${infoPlano.nomePlano} | Dias: ${diasCobrados}`
            : `PIX Mercado Pago gerado (ID: ${paymentId}) | Plano: ${infoPlano.nomePlano} (${periodoEscolhido}) | Dias: ${diasCobrados}`;

          // Grava no histórico de pagamentos
          await supabaseAdmin.from('historico_pagamentos_planos').insert({
            loja_id: lojaId,
            valor: valorCobranca,
            status: 'pendente',
            mp_payment_id: paymentId,
            qr_code: qrCode,
            qr_code_base64: qrCodeBase64,
            metodo_pagamento: 'pix',
            plano_contratado: planoEscolhido,
            periodo_contratado: periodoEscolhido,
            observacao: obsHistorico
          });

          return NextResponse.json({
            success: true,
            modo: 'mercadopago',
            paymentId,
            qrCode,
            qrCodeBase64,
            ticketUrl,
            valor: valorCobranca,
            diasCobrados,
            diasRestantes,
            isProporcional
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
