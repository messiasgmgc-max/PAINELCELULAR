import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lojaId = url.searchParams.get('lojaId');

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    const { data: loja, error } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, chave_pix, chave_pix_cobranca, config_atacado')
      .eq('id', lojaId)
      .maybeSingle();

    if (error || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const defaultConfig = {
      cobranca_automatica_ativa: false,
      horario_disparo: '10:00',
      dias_semana: [1, 2, 3, 4, 5],
      modelo_mensagem: 'Olá {nome}! Tudo bem? Passando para lembrar sobre seu saldo em aberto de R$ {valor} no {nome_loja}.\n\nChave PIX para pagamento: {chave_pix}\n\nQualquer dúvida estamos à disposição!',
      incluir_chave_pix: true,
      notificar_dono: true
    };

    const configAtacado = { ...defaultConfig, ...(loja.config_atacado || {}) };

    return NextResponse.json({
      success: true,
      config: configAtacado,
      chavePix: loja.chave_pix || loja.chave_pix_cobranca || '',
      nomeLoja: loja.nome || 'Phone Center'
    });
  } catch (err: any) {
    console.error('Erro ao buscar configurações de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { lojaId, configAtacado } = body;

    if (!lojaId) {
      return NextResponse.json({ error: 'ID da loja é obrigatório' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('lojas')
      .update({
        config_atacado: configAtacado,
        updated_at: new Date().toISOString()
      })
      .eq('id', lojaId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      mensagem: 'Configurações de atacado salvas com sucesso!',
      config: configAtacado
    });
  } catch (err: any) {
    console.error('Erro ao salvar configurações de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
