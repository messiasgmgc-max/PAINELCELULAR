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

      // Extrair dias e destino do histórico se existirem
      let diasAdicionar = 30;
      let destinoWhatsApp = '';
      let instanciaWhatsApp = 'lucasimports';

      if (historico?.observacao) {
        const matchDias = historico.observacao.match(/Dias:\s*(\d+)/i);
        if (matchDias) diasAdicionar = parseInt(matchDias[1], 10);
        const matchDest = historico.observacao.match(/Destino:\s*([^\s|]+)/i);
        if (matchDest) destinoWhatsApp = matchDest[1];
        const matchInst = historico.observacao.match(/Instancia:\s*([^\s|]+)/i);
        if (matchInst) instanciaWhatsApp = matchInst[1];
      }

      // Calcula novo vencimento respeitando a data atual se ainda não venceu
      let baseDate = new Date();
      if (lojaAtual?.data_vencimento) {
        const parts = String(lojaAtual.data_vencimento).split('T')[0].split('-');
        if (parts.length === 3) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          const vencAtual = new Date(year, month, day);
          if (vencAtual.getTime() > baseDate.getTime()) {
            baseDate = vencAtual;
          }
        }
      }

      const novaDataMs = baseDate.getTime() + diasAdicionar * 24 * 60 * 60 * 1000;
      const novoVencimento = new Date(novaDataMs).toISOString().split('T')[0];
      const [ny, nm, nd] = novoVencimento.split('-');
      const novoVencimentoFmt = `${nd}/${nm}/${ny}`;

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
          observacao: `Aprovado via Webhook Mercado Pago (ID: ${paymentId}) | Renovado +${diasAdicionar} dias até ${novoVencimentoFmt}`
        })
        .eq('mp_payment_id', String(paymentId));

      // 4. Gravar log de auditoria
      await registrarLog({
        loja_id: lojaId,
        tipo_evento: 'plano',
        acao: 'Mensalidade Paga via Webhook PIX',
        detalhes: `Pagamento de R$ ${mpPayment.transaction_amount} confirmado automaticamente via Webhook. Novo vencimento: ${novoVencimentoFmt}`
      });

      console.log(`[Webhook MercadoPago] Loja ${lojaId} renovada com sucesso até ${novoVencimentoFmt}`);

      // 5. Notificar no WhatsApp se houver destino registrado
      if (destinoWhatsApp) {
        const evolutionUrl = (process.env.EVOLUTION_API_URL || 'http://13.140.36.50:8080').trim().replace(/\/+$/, '');
        const apiKey = (process.env.EVOLUTION_API_KEY || '806DF49FA0E9-4088-B016-1CB736FAF449').trim();
        const isGroup = destinoWhatsApp.endsWith('@g.us');
        const cleanDestination = isGroup ? destinoWhatsApp : destinoWhatsApp.replace(/\D/g, '');

        if (evolutionUrl && apiKey && cleanDestination) {
          const valorPago = Number(mpPayment.transaction_amount || 0).toFixed(2).replace('.', ',');
          const msgAprovado = `🎉 *PAGAMENTO CONFIRMADO COM SUCESSO!*\n\n` +
            `Recebemos seu PIX de *R$ ${valorPago}*!\n` +
            `Sua assinatura foi estendida em *+${diasAdicionar} dias*.\n\n` +
            `📅 *Novo Vencimento*: *${novoVencimentoFmt}*\n` +
            `✅ O sistema está 100% liberado e ativo. Boas vendas! 🚀`;

          try {
            await fetch(`${evolutionUrl}/message/sendText/${instanciaWhatsApp || 'lucasimports'}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: apiKey },
              body: JSON.stringify({ number: cleanDestination, text: msgAprovado })
            });
          } catch (whatsErr) {
            console.error('Falha ao enviar notificação no WhatsApp pelo webhook MP:', whatsErr);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Erro no Webhook Mercado Pago:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno' }, { status: 200 });
  }
}
