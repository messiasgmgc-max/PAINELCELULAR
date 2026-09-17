import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarRespostaTicketSuporteEmail } from '@/lib/email/emailService';

export const dynamic = 'force-dynamic';

async function obterUsuarioDaRequisicao(request: Request) {
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obterUsuarioDaRequisicao(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const { data: ticket, error } = await supabaseAdmin
      .from('tickets_suporte')
      .select('*, perfis(nome, email), lojas(nome)')
      .eq('id', id)
      .maybeSingle();

    if (error || !ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (err: any) {
    console.error('Erro ao obter ticket:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao carregar detalhes.' }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await obterUsuarioDaRequisicao(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { resposta, novoStatus } = body;

    if (!resposta?.trim()) {
      return NextResponse.json({ error: 'Conteúdo da resposta é obrigatório.' }, { status: 400 });
    }

    const { data: ticket, error: erroTicket } = await supabaseAdmin
      .from('tickets_suporte')
      .select('*, perfis(email, nome), lojas(nome, email)')
      .eq('id', id)
      .maybeSingle();

    if (erroTicket || !ticket) {
      return NextResponse.json({ error: 'Chamado não encontrado.' }, { status: 404 });
    }

    const isAdmin = usuario.role === 'super_admin' || usuario.email === 'guiguigamer125@gmail.com';
    const respostasAtuais = Array.isArray(ticket.respostas) ? ticket.respostas : [];

    const novaResposta = {
      id: `resp_${Date.now()}`,
      autor_id: usuario.id,
      autor_nome: usuario.nome || (isAdmin ? 'Suporte Phone Center' : 'Lojista'),
      autor_email: usuario.email,
      is_staff: isAdmin,
      mensagem: resposta.trim(),
      created_at: new Date().toISOString(),
    };

    const statusFinal = novoStatus || (isAdmin ? 'respondido' : 'em_andamento');

    const { data: atualizado, error: erroUpdate } = await supabaseAdmin
      .from('tickets_suporte')
      .update({
        respostas: [...respostasAtuais, novaResposta],
        status: statusFinal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .maybeSingle();

    if (erroUpdate) throw erroUpdate;

    // Se o staff/admin respondeu, notifica o lojista por e-mail
    if (isAdmin) {
      const emailLojista = ticket.perfis?.email || ticket.lojas?.email;
      if (emailLojista) {
        enviarRespostaTicketSuporteEmail({
          para: emailLojista,
          ticketId: id,
          nomeLoja: ticket.lojas?.nome || 'Minha Loja',
          assunto: ticket.assunto,
          resposta: resposta.trim(),
        }).catch((e) => console.warn('Aviso envio email resposta ticket:', e));
      }
    }

    return NextResponse.json({
      success: true,
      ticket: atualizado,
      message: 'Resposta enviada com sucesso.',
    });
  } catch (err: any) {
    console.error('Erro ao responder ticket:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao enviar resposta.' }, { status: 500 });
  }
}
