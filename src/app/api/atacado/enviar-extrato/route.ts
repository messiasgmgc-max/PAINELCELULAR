import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarTextoWhatsApp, formatarTelefoneWhatsApp } from '@/lib/whatsappService';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      lojaId,
      lojistaNome,
      telefone: telBruto,
      mensagem,
      valorTotal,
    } = body;

    if (!mensagem || !mensagem.trim()) {
      return NextResponse.json({ error: 'Mensagem do extrato não pode estar vazia.' }, { status: 400 });
    }

    let telefone = telBruto;

    // Se não veio telefone direto, tenta buscar
    if (!telefone && lojistaNome && lojaId) {
      try {
        const { data: lDb } = await supabaseAdmin
          .from('lojistas_devedores')
          .select('whatsapp, telefone')
          .eq('loja_id', lojaId)
          .ilike('nome', lojistaNome.trim())
          .maybeSingle();

        if (lDb?.whatsapp || lDb?.telefone) {
          telefone = lDb.whatsapp || lDb.telefone;
        } else {
          const { data: compDb } = await supabaseAdmin
            .from('compradores_frequentes')
            .select('telefone')
            .eq('loja_id', lojaId)
            .ilike('nome', lojistaNome.trim())
            .maybeSingle();
          if (compDb?.telefone) telefone = compDb.telefone;
        }
      } catch (eTel) {
        console.warn('Aviso busca telefone para envio de extrato:', eTel);
      }
    }

    const cleanPhone = formatarTelefoneWhatsApp(telefone);
    if (!cleanPhone || cleanPhone.length < 10) {
      return NextResponse.json({
        error: `O lojista "${lojistaNome || 'Parceiro'}" não possui número de WhatsApp válido cadastrado. Informe o número para enviar.`,
      }, { status: 400 });
    }

    // Envio Real via Evolution API
    const envio = await enviarTextoWhatsApp({
      lojaId: lojaId || null,
      telefone: cleanPhone,
      texto: mensagem.trim(),
    });

    if (!envio.success) {
      return NextResponse.json({
        error: envio.error || 'Falha ao entregar mensagem no WhatsApp via Evolution API.',
      }, { status: 502 });
    }

    // Grava histórico de disparo
    if (lojaId && lojistaNome) {
      try {
        await supabaseAdmin
          .from('lojistas_devedores')
          .update({
            ultimo_disparo_cobranca: new Date().toISOString(),
            ...(telefone ? { whatsapp: telefone } : {}),
          })
          .eq('loja_id', lojaId)
          .ilike('nome', lojistaNome.trim());

        await supabaseAdmin.from('historico_cobrancas_atacado').insert([{
          loja_id: lojaId,
          lojista_nome: lojistaNome,
          whatsapp: cleanPhone,
          valor_cobrado: Number(valorTotal) || 0,
          mensagem_enviada: mensagem.trim(),
          status: 'enviado',
          origem: 'manual_extrato',
        }]);
      } catch (eLog) {
        console.warn('Aviso gravação histórico extrato:', eLog);
      }
    }

    return NextResponse.json({
      success: true,
      mensagem: `📲 Extrato enviado com sucesso para o WhatsApp de ${lojistaNome || cleanPhone}!`,
      telefone: cleanPhone,
    });
  } catch (err: any) {
    console.error('Erro ao enviar extrato via WhatsApp:', err);
    return NextResponse.json({ error: err.message || 'Erro interno ao disparar extrato.' }, { status: 500 });
  }
}
