import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarTextoWhatsApp, formatarTelefoneWhatsApp } from '@/lib/whatsappService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      lojaId,
      compradorNome,
      compradorTelefone,
      itens = [],
      valorTotal,
      formaPagamento = 'pix',
      dataVencimento,
    } = body;

    if (!lojaId || !compradorNome) {
      return NextResponse.json(
        { error: 'lojaId e compradorNome são obrigatórios' },
        { status: 400 }
      );
    }

    const nomeLimpo = String(compradorNome).trim();
    if (
      !nomeLimpo ||
      ['cliente final', 'cliente balcão', 'venda varejo', 'lojista / revenda', 'pendente'].includes(
        nomeLimpo.toLowerCase()
      )
    ) {
      return NextResponse.json({
        success: false,
        enviado: false,
        motivo: 'Comprador genérico, notificação não enviada.',
      });
    }

    // 1. Buscar dados da loja
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, chave_pix, chave_pix_cobranca')
      .eq('id', lojaId)
      .maybeSingle();

    const nomeLoja = loja?.nome || 'Phone Center';
    const chavePix = loja?.chave_pix || loja?.chave_pix_cobranca || '';

    // 2. Resolver o número de WhatsApp do lojista
    let telefoneDestino = compradorTelefone ? formatarTelefoneWhatsApp(compradorTelefone) : '';

    if (!telefoneDestino || telefoneDestino.length < 10) {
      // Tenta na tabela lojistas_devedores
      const { data: dev } = await supabaseAdmin
        .from('lojistas_devedores')
        .select('whatsapp, telefone')
        .eq('loja_id', lojaId)
        .ilike('nome', nomeLimpo)
        .maybeSingle();

      if (dev?.whatsapp || dev?.telefone) {
        telefoneDestino = formatarTelefoneWhatsApp(dev.whatsapp || dev.telefone || '');
      }
    }

    if (!telefoneDestino || telefoneDestino.length < 10) {
      // Tenta na tabela compradores_frequentes
      const { data: comp } = await supabaseAdmin
        .from('compradores_frequentes')
        .select('telefone')
        .eq('loja_id', lojaId)
        .ilike('nome', nomeLimpo)
        .maybeSingle();

      if (comp?.telefone) {
        telefoneDestino = formatarTelefoneWhatsApp(comp.telefone);
      }
    }

    if (!telefoneDestino || telefoneDestino.length < 10) {
      // Tenta na tabela clientes
      const { data: cli } = await supabaseAdmin
        .from('clientes')
        .select('telefone')
        .eq('loja_id', lojaId)
        .ilike('nome', nomeLimpo)
        .maybeSingle();

      if (cli?.telefone) {
        telefoneDestino = formatarTelefoneWhatsApp(cli.telefone);
      }
    }

    if (!telefoneDestino || telefoneDestino.length < 10) {
      return NextResponse.json({
        success: true,
        enviado: false,
        motivo: `Nenhum WhatsApp cadastrado para o lojista "${nomeLimpo}". Cadastre o número para notificações automáticas.`,
      });
    }

    // 3. Calcular o saldo devedor atualizado total do lojista em tempo real
    let saldoDevedorTotal = 0;
    try {
      const { data: vendasCliente } = await supabaseAdmin
        .from('vendas')
        .select('valor, valorPago, saldoDevedor, status, metodo')
        .eq('loja_id', lojaId)
        .ilike('clienteNome', nomeLimpo);

      if (vendasCliente && vendasCliente.length > 0) {
        vendasCliente.forEach((v) => {
          const val = Number(v.valor || 0);
          const pago = Number(v.valorPago || 0);
          let dev = 0;
          if (v.saldoDevedor !== undefined && v.saldoDevedor !== null && Number(v.saldoDevedor) > 0) {
            dev = Number(v.saldoDevedor);
          } else if (v.metodo === 'fiado' || v.status === 'pendente' || v.status === 'parcial') {
            dev = Math.max(0, val - pago);
            if (dev <= 0 && v.status !== 'pago') dev = val;
          }
          saldoDevedorTotal += dev;
        });
      }

      // Atualiza também na tabela lojistas_devedores para manter sincronicidade perfeita
      await supabaseAdmin
        .from('lojistas_devedores')
        .update({
          saldo_devedor: saldoDevedorTotal,
          whatsapp: telefoneDestino,
          updated_at: new Date().toISOString(),
        })
        .eq('loja_id', lojaId)
        .ilike('nome', nomeLimpo);
    } catch (eCalc) {
      console.warn('Aviso ao calcular saldo do lojista:', eCalc);
    }

    // 4. Montar a mensagem profissional do comprovante de venda de atacado
    const valTotalNum = Number(valorTotal || 0);
    const valTotalFmt = valTotalNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const saldoTotalFmt = saldoDevedorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let textoMsg = `📱 *COMPROVANTE DE VENDA ATACADO - ${nomeLoja.toUpperCase()}*\n`;
    textoMsg += `Olá, *${nomeLimpo}*! Seu pedido de atacado foi registrado com sucesso. 🚀\n\n`;

    if (Array.isArray(itens) && itens.length > 0) {
      textoMsg += `📦 *Itens do Pedido (${itens.length} un):*\n`;
      itens.forEach((it, idx) => {
        const desc = `${it.modelo || 'Aparelho'} ${it.capacidade || ''} ${it.cor || ''}`.trim();
        const ident = it.codigo ? `ID: ${it.codigo}` : (it.imei ? `IMEI: ${it.imei}` : '');
        const precoItem = Number(it.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        textoMsg += ` ${idx + 1}. *${desc}* ${ident ? `(${ident})` : ''} - R$ ${precoItem}\n`;
      });
      textoMsg += `\n`;
    }

    textoMsg += `💰 *Valor Desta Compra:* R$ ${valTotalFmt}\n`;
    textoMsg += `💳 *Forma de Pagamento:* ${String(formaPagamento).toUpperCase()}\n`;

    if (String(formaPagamento).toLowerCase() === 'fiado' && dataVencimento) {
      const dV = new Date(dataVencimento);
      if (!isNaN(dV.getTime())) {
        textoMsg += `📅 *Vencimento Desta Compra:* ${dV.toLocaleDateString('pt-BR')}\n`;
      }
    }

    textoMsg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    textoMsg += `📊 *SITUAÇÃO FINANCEIRA ATUAL:*\n`;
    if (saldoDevedorTotal > 0.01) {
      textoMsg += `⚠️ *Saldo Devedor Total Acumulado:* R$ ${saldoTotalFmt}\n`;
      if (chavePix) {
        textoMsg += `\n🔑 *Chave PIX para Acertos:*\n\`${chavePix}\`\n`;
      }
    } else {
      textoMsg += `✅ *Saldo em Aberto:* R$ 0,00 (Tudo quitado)\n`;
    }
    textoMsg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    textoMsg += `Agradecemos a confiança e a parceria! Qualquer dúvida estamos à disposição. 🤝`;

    // 5. Enviar via WhatsApp
    const envio = await enviarTextoWhatsApp({
      lojaId,
      telefone: telefoneDestino,
      texto: textoMsg,
    });

    if (!envio.success) {
      return NextResponse.json({
        success: false,
        enviado: false,
        telefone: telefoneDestino,
        motivo: envio.error || 'Falha ao entregar mensagem no WhatsApp.',
      });
    }

    // 6. Registrar nos logs
    try {
      await supabaseAdmin.from('whatsapp_logs').insert({
        loja_id: lojaId,
        contato: `${nomeLimpo} (${telefoneDestino})`,
        mensagem: textoMsg,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      enviado: true,
      telefone: telefoneDestino,
      mensagem: 'Comprovante de atacado enviado no WhatsApp com sucesso!',
    });
  } catch (err: any) {
    console.error('Erro na rota de notificação de venda atacado:', err);
    return NextResponse.json(
      { error: err.message || 'Erro interno ao notificar venda' },
      { status: 500 }
    );
  }
}
