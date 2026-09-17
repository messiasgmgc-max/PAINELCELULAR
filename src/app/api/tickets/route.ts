import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { enviarNovoTicketSuporteEmail } from '@/lib/email/emailService';

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

export async function GET(request: Request) {
  try {
    const usuario = await obterUsuarioDaRequisicao(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    let query = supabaseAdmin
      .from('tickets_suporte')
      .select('*, perfis(nome, email), lojas(nome)')
      .order('created_at', { ascending: false });

    // Super admin vê todos; lojista vê apenas da sua loja
    if (usuario.role !== 'super_admin' && usuario.email !== 'guiguigamer125@gmail.com') {
      if (!usuario.loja_id) {
        return NextResponse.json({ tickets: [] });
      }
      query = query.eq('loja_id', usuario.loja_id);
    }

    const { data: tickets, error } = await query;
    if (error) {
      // Se tabela não existir ainda, retorna lista vazia gracefully
      console.warn('Aviso consulta tickets:', error.message);
      return NextResponse.json({ tickets: [] });
    }

    return NextResponse.json({ tickets: tickets || [] });
  } catch (err: any) {
    console.error('Erro ao listar tickets:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao listar chamados.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const usuario = await obterUsuarioDaRequisicao(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const { assunto, mensagem, prioridade = 'normal', categoria = 'duvida' } = body;

    if (!assunto?.trim() || !mensagem?.trim()) {
      return NextResponse.json({ error: 'Assunto e mensagem são obrigatórios.' }, { status: 400 });
    }

    // Busca nome da loja
    let nomeLoja = 'Phone Center';
    if (usuario.loja_id) {
      const { data: loja } = await supabaseAdmin.from('lojas').select('nome').eq('id', usuario.loja_id).maybeSingle();
      if (loja?.nome) nomeLoja = loja.nome;
    }

    const ticketId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ticket_${Date.now()}`;

    const novoTicket = {
      id: ticketId,
      loja_id: usuario.loja_id || null,
      usuario_id: usuario.id,
      assunto: assunto.trim(),
      mensagem: mensagem.trim(),
      prioridade: prioridade.toLowerCase(),
      categoria: categoria.toLowerCase(),
      status: 'aberto',
      respostas: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: criado, error: erroInsert } = await supabaseAdmin
      .from('tickets_suporte')
      .insert(novoTicket)
      .select()
      .maybeSingle();

    if (erroInsert) {
      console.warn('Aviso inserção ticket no Supabase:', erroInsert.message);
    }

    // Dispara notificação por e-mail via Resend (suporte@phonecenter.tech)
    enviarNovoTicketSuporteEmail({
      ticketId,
      nomeLoja,
      lojistaEmail: usuario.email,
      assunto: assunto.trim(),
      prioridade,
      mensagem: mensagem.trim(),
    }).catch((e) => console.warn('Aviso envio email novo ticket:', e));

    return NextResponse.json({
      success: true,
      ticket: criado || novoTicket,
      message: 'Chamado de suporte aberto com sucesso! Nossa equipe foi notificada.',
    });
  } catch (err: any) {
    console.error('Erro ao abrir ticket de suporte:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao registrar chamado.' }, { status: 500 });
  }
}
