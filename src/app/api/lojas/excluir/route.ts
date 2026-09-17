import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarConfirmacaoExclusaoLojaEmail } from '@/lib/email/emailService';
import { registrarLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    const email = authData?.user?.email;
    if (authError || !email) {
      return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    const { data: perfil } = await supabaseAdmin
      .from('perfis')
      .select('id, nome, role, loja_id')
      .eq('email', email)
      .maybeSingle();

    if (!perfil || !perfil.loja_id) {
      return NextResponse.json({ error: 'Perfil ou loja não encontrada.' }, { status: 404 });
    }

    if (perfil.role !== 'admin' && perfil.role !== 'super_admin') {
      return NextResponse.json({ error: 'Apenas o proprietário ou administrador pode encerrar a loja.' }, { status: 403 });
    }

    const { data: loja, error: erroLoja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, email')
      .eq('id', perfil.loja_id)
      .maybeSingle();

    if (erroLoja || !loja) {
      return NextResponse.json({ error: 'Loja não encontrada.' }, { status: 404 });
    }

    // Desativa a loja
    const { error: erroUpdate } = await supabaseAdmin
      .from('lojas')
      .update({
        ativo: false,
        plano_status: 'cancelado',
        configuracoes: {
          encerrada_em: new Date().toISOString(),
          encerrada_por: perfil.nome || perfil.email,
        }
      })
      .eq('id', loja.id);

    if (erroUpdate) throw erroUpdate;

    // Dispara e-mail de confirmação de exclusão
    const destinoEmail = loja.email || email;
    enviarConfirmacaoExclusaoLojaEmail({
      para: destinoEmail,
      nomeLoja: loja.nome || 'Minha Loja',
    }).catch((e) => console.warn('Aviso envio confirmacao exclusao email:', e));

    await registrarLog({
      loja_id: loja.id,
      usuario_id: perfil.id,
      usuario_email: perfil.email,
      usuario_nome: perfil.nome,
      tipo_evento: 'loja',
      acao: 'Encerramento de Loja',
      detalhes: `A loja ${loja.nome} foi desativada pelo proprietário ${perfil.nome || perfil.email}.`,
    });

    return NextResponse.json({
      success: true,
      message: 'Loja encerrada com sucesso. Um e-mail de confirmação foi enviado.',
    });
  } catch (err: any) {
    console.error('Erro ao excluir/encerrar loja:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao processar encerramento da loja.' }, { status: 500 });
  }
}
