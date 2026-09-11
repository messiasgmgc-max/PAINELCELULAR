import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { registrarLog } from '@/lib/logger';
import {
  lerAssinatura,
  podeGerenciarAssinatura,
  registrarCancelamento,
  registrarReativacao,
} from '@/lib/planos/assinatura';

/**
 * Cancela ou desfaz o cancelamento da assinatura da loja de quem está logado.
 * A loja vem do perfil do usuário autenticado, nunca do corpo da requisição.
 */
async function perfilDaRequisicao(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const email = data?.user?.email;
  if (error || !email) return null;

  const { data: perfil } = await supabaseAdmin
    .from('perfis')
    .select('id, nome, role, loja_id')
    .eq('email', email)
    .maybeSingle();

  return perfil ? { ...perfil, email } : null;
}

export async function POST(request: Request) {
  try {
    const perfil = await perfilDaRequisicao(request);
    if (!perfil) {
      return NextResponse.json({ error: 'Entre de novo para alterar a assinatura.' }, { status: 401 });
    }
    if (!perfil.loja_id) {
      return NextResponse.json({ error: 'Seu usuário não está ligado a nenhuma loja.' }, { status: 403 });
    }
    if (!podeGerenciarAssinatura(perfil.role)) {
      return NextResponse.json(
        { error: 'Só o dono ou um gerente da loja pode alterar a assinatura.' },
        { status: 403 }
      );
    }

    const corpo = await request.json().catch(() => ({}));
    const acao = corpo?.acao;
    if (acao !== 'cancelar' && acao !== 'reativar') {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const { data: loja, error: erroLoja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, configuracoes, data_vencimento, plano_status')
      .eq('id', perfil.loja_id)
      .maybeSingle();

    if (erroLoja || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
    }
    if (loja.plano_status === 'vitalicio') {
      return NextResponse.json({ error: 'Acesso vitalício não tem cobrança para cancelar.' }, { status: 400 });
    }

    const agora = new Date();
    const por = perfil.nome || perfil.email;
    const configuracoes =
      acao === 'cancelar'
        ? registrarCancelamento(loja.configuracoes, {
            motivo: typeof corpo?.motivo === 'string' ? corpo.motivo : null,
            por,
            agora,
            dataVencimento: loja.data_vencimento,
          })
        : registrarReativacao(loja.configuracoes, { por, agora });

    const { error: erroUpdate } = await supabaseAdmin.from('lojas').update({ configuracoes }).eq('id', loja.id);
    if (erroUpdate) throw erroUpdate;

    const assinatura = lerAssinatura(configuracoes, loja.data_vencimento);

    await registrarLog({
      loja_id: loja.id,
      usuario_id: perfil.id,
      usuario_email: perfil.email,
      usuario_nome: perfil.nome,
      tipo_evento: 'plano',
      acao: acao === 'cancelar' ? 'Assinatura cancelada pelo lojista' : 'Cancelamento da assinatura desfeito',
      detalhes:
        acao === 'cancelar'
          ? `Acesso mantido até ${assinatura.acessoAte || 'o vencimento'}. Motivo: ${assinatura.motivo || 'não informado'}.`
          : 'A assinatura volta a ser renovada normalmente.',
      valor_novo: configuracoes.assinatura,
    });

    return NextResponse.json({ ok: true, assinatura });
  } catch (erro) {
    console.error('Erro ao alterar assinatura:', erro);
    return NextResponse.json({ error: 'Não foi possível alterar a assinatura. Tente de novo.' }, { status: 500 });
  }
}
