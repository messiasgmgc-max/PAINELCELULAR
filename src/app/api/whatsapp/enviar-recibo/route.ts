import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { registrarLog } from '@/lib/logger';
import { vendaCancelada } from '@/lib/vendas/situacao';
import { enviarDocumentoWhatsApp, formatarTelefoneWhatsApp } from '@/lib/whatsappService';
import {
  base64DoPdf,
  codigoVenda,
  lerConfigReciboWhatsapp,
  montarMensagemRecibo,
  nomeArquivoRecibo,
} from '@/lib/whatsapp/reciboWhatsapp';

/**
 * Recibo da venda em PDF para o WhatsApp do cliente (Configurações → Notificações).
 * A loja vem do usuário logado; o telefone vem do cadastro do cliente da venda.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const acesso = await exigirAcesso(request);
  if (!acesso.ok) return acesso.resposta;
  const lojaId = acesso.usuario.lojaId;
  if (!lojaId) return NextResponse.json({ ativo: false });

  const { data } = await supabaseAdmin.from('lojas').select('configuracoes').eq('id', lojaId).maybeSingle();
  return NextResponse.json({ ativo: lerConfigReciboWhatsapp(data?.configuracoes).ativo });
}

export async function POST(request: Request) {
  const acesso = await exigirAcesso(request);
  if (!acesso.ok) return acesso.resposta;
  const { usuario } = acesso;
  const lojaId = usuario.lojaId;
  if (!lojaId) return NextResponse.json({ error: 'Usuário sem loja.' }, { status: 400 });

  try {
    const corpo = await request.json().catch(() => null);
    const vendaId = corpo?.vendaId;
    if (typeof vendaId !== 'string' || !UUID.test(vendaId)) {
      return NextResponse.json({ error: 'Venda inválida.' }, { status: 400 });
    }
    const pdf = base64DoPdf(corpo?.pdfBase64);
    if (!pdf) return NextResponse.json({ error: 'PDF do recibo inválido ou grande demais.' }, { status: 400 });

    const { data: loja } = await supabaseAdmin.from('lojas').select('nome, configuracoes').eq('id', lojaId).maybeSingle();
    const config = lerConfigReciboWhatsapp(loja?.configuracoes);
    if (!config.ativo) return NextResponse.json({ enviado: false, motivo: 'desativado' });

    const { data: venda } = await supabaseAdmin
      .from('vendas')
      .select('id, "clienteId", "clienteNome", valor, itens, status')
      .eq('id', vendaId)
      .eq('loja_id', lojaId)
      .maybeSingle();
    if (!venda) return NextResponse.json({ error: 'Venda não encontrada.' }, { status: 404 });
    if (vendaCancelada(venda)) return NextResponse.json({ enviado: false, motivo: 'cancelada' });

    let telefone = '';
    if (venda.clienteId) {
      const { data: cliente } = await supabaseAdmin
        .from('clientes')
        .select('telefone')
        .eq('id', venda.clienteId)
        .eq('loja_id', lojaId)
        .maybeSingle();
      telefone = String(cliente?.telefone || '');
    }
    const numero = formatarTelefoneWhatsApp(telefone);
    // "00000000000" é o telefone de preenchimento de clientes sem cadastro completo.
    if (!numero || numero.length < 12 || /^0/.test(numero)) {
      return NextResponse.json({ enviado: false, motivo: 'sem_telefone' });
    }

    const itens = Array.isArray(venda.itens) ? venda.itens : [];
    const aparelho = itens.map((item: { descricao?: string }) => item?.descricao).filter(Boolean).join(', ');
    const legenda = montarMensagemRecibo(config.mensagem, {
      cliente: venda.clienteNome,
      loja: loja?.nome,
      vendaId,
      valor: Number(venda.valor || 0),
      aparelho,
    });

    const envio = await enviarDocumentoWhatsApp({
      lojaId,
      telefone,
      base64: pdf,
      nomeArquivo: nomeArquivoRecibo(vendaId),
      legenda,
    });
    if (!envio.success) {
      return NextResponse.json({ enviado: false, error: envio.error || 'Falha no envio.' }, { status: 502 });
    }

    await registrarLog({
      loja_id: lojaId,
      usuario_id: usuario.id,
      usuario_email: usuario.email,
      usuario_nome: usuario.nome,
      tipo_evento: 'venda',
      acao: 'Recibo enviado no WhatsApp',
      detalhes: `Recibo da venda #${codigoVenda(vendaId)} enviado para ${venda.clienteNome || 'o cliente'} (final ${numero.slice(-4)}).`,
    });

    return NextResponse.json({ enviado: true });
  } catch (erro) {
    console.error('[whatsapp/enviar-recibo]', erro);
    return NextResponse.json({ error: 'Não foi possível enviar o recibo.' }, { status: 500 });
  }
}
