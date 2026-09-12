import { NextResponse } from 'next/server';
import { lojaEfetiva, PAPEIS_GESTAO } from '@/lib/auth/acesso';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';

const ERRO_SEM_LOJA = 'Seu usuário não está ligado a nenhuma loja. Peça ao suporte para vincular sua loja.';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const acesso = await exigirAcesso(request, { lojaId: null });
    if (!acesso.ok) return acesso.resposta;
    // Sem loja resolvida pelo usuário logado, erro claro: nunca a loja de outra pessoa
    // (antes caía na loja mais recente do banco).
    const lojaId = lojaEfetiva(acesso.usuario, url.searchParams.get('lojaId'));
    if (!lojaId) {
      return NextResponse.json({ error: ERRO_SEM_LOJA }, { status: 403 });
    }

    const { data: loja, error } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, chave_pix, chave_pix_cobranca, config_atacado')
      .eq('id', lojaId)
      .maybeSingle();

    if (error || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404 });
    }

    const defaultMsg = 'Olá {nome}! Tudo bem? Passando para lembrar sobre os pagamentos pendentes das suas retiradas de atacado na {nome_loja}.\n\n*Saldo em aberto: {valor}*\n\nChave Pix para quitação: {chave_pix}\n\nSe já realizou a transferência, por favor nos envie o comprovante!';

    const defaultConfig = {
      ativo: true,
      cobranca_automatica_ativa: false,
      horario_disparo: '10:00',
      dias_semana: [1, 2, 3, 4, 5],
      dias_carencia: 1,
      mensagem_template: defaultMsg,
      modelo_mensagem: defaultMsg,
      tipo_modelo: 'simples',
      enviar_somente_dias_uteis: true,
      incluir_chave_pix: true,
      notificar_dono: true,
      chave_pix: loja.chave_pix || loja.chave_pix_cobranca || '',
    };

    const rawConfig = loja.config_atacado || {};
    const msgTemplate = rawConfig.mensagem_template || rawConfig.modelo_mensagem || defaultMsg;

    const configAtacado = {
      ...defaultConfig,
      ...rawConfig,
      mensagem_template: msgTemplate,
      modelo_mensagem: msgTemplate,
      chave_pix: rawConfig.chave_pix || loja.chave_pix || loja.chave_pix_cobranca || '',
    };

    return NextResponse.json({
      success: true,
      lojaId: loja.id,
      config: configAtacado,
      chavePix: loja.chave_pix || loja.chave_pix_cobranca || configAtacado.chave_pix || '',
      nomeLoja: loja.nome || 'Lucas Imports',
    });
  } catch (err: any) {
    console.error('Erro ao buscar configurações de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const acesso = await exigirAcesso(request, { lojaId: null, papeis: PAPEIS_GESTAO });
    if (!acesso.ok) return acesso.resposta;
    const lojaId = lojaEfetiva(acesso.usuario, body.lojaId || (body.configAtacado && body.configAtacado.lojaId));
    if (!lojaId) {
      // Sem fallback: gravar na "loja mais recente" era gravar na loja de outra pessoa.
      return NextResponse.json({ error: ERRO_SEM_LOJA }, { status: 403 });
    }

    const configPayload = body.configAtacado ? { ...body.configAtacado } : { ...body };
    delete configPayload.lojaId;

    const msgTemplate = configPayload.mensagem_template || configPayload.modelo_mensagem || '';
    if (msgTemplate) {
      configPayload.mensagem_template = msgTemplate;
      configPayload.modelo_mensagem = msgTemplate;
    }

    const updateLojaData: Record<string, any> = {
      config_atacado: configPayload,
    };

    if (configPayload.chave_pix && typeof configPayload.chave_pix === 'string') {
      updateLojaData.chave_pix = configPayload.chave_pix.trim();
      updateLojaData.chave_pix_cobranca = configPayload.chave_pix.trim();
    }

    const { error: updateError } = await supabaseAdmin
      .from('lojas')
      .update(updateLojaData)
      .eq('id', lojaId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      mensagem: 'Configurações de atacado salvas com sucesso! 🤖✅',
      config: configPayload,
    });
  } catch (err: any) {
    console.error('Erro ao salvar configurações de atacado:', err);
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}
