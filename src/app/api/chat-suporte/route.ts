import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  enviarMensagemChatSuporteParaAdminEmail,
  enviarRespostaChatSuporteParaLojistaEmail,
} from '@/lib/email/emailService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

async function obterUsuario(request: Request) {
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

  return perfil ? { ...perfil, email } : { id: data.user.id, email, role: 'admin', loja_id: null, nome: email.split('@')[0] };
}

/**
 * GET /api/chat-suporte
 * Sem cache: retorna sempre os dados em tempo real direto do banco.
 */
export async function GET(request: Request) {
  try {
    const usuario = await obterUsuario(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401, headers: NO_CACHE_HEADERS });
    }

    const { searchParams } = new URL(request.url);
    const requestedLojaId = searchParams.get('loja_id');
    const listarConversas = searchParams.get('conversas') === 'true';

    const isSuperAdmin = usuario.role === 'super_admin' || usuario.email === 'guiguigamer125@gmail.com';

    // SUPER ADMIN LISTANDO CONVERSAS DE TODAS AS LOJAS
    if (isSuperAdmin && listarConversas) {
      // 1. Busca todas as lojas
      const { data: lojas } = await supabaseAdmin
        .from('lojas')
        .select('id, nome, logo_url, subtitulo, ativo')
        .order('nome', { ascending: true });

      // 2. Busca as mensagens de suporte
      const { data: mensagens } = await supabaseAdmin
        .from('chat_suporte_mensagens')
        .select('*')
        .order('created_at', { ascending: false });

      const conversasPorLoja: Record<string, any> = {};

      if (mensagens) {
        mensagens.forEach((msg) => {
          if (!msg.loja_id) return;
          if (!conversasPorLoja[msg.loja_id]) {
            conversasPorLoja[msg.loja_id] = {
              ultimaMensagem: msg,
              totalNaoLidas: 0,
              mensagensCount: 0,
            };
          }
          conversasPorLoja[msg.loja_id].mensagensCount += 1;
          if (!msg.lida && msg.remetente === 'cliente') {
            conversasPorLoja[msg.loja_id].totalNaoLidas += 1;
          }
        });
      }

      const listaFinal = (lojas || []).map((l) => ({
        loja_id: l.id,
        loja_nome: l.nome,
        loja_logo: l.logo_url,
        ultima_mensagem: conversasPorLoja[l.id]?.ultimaMensagem || null,
        nao_lidas: conversasPorLoja[l.id]?.totalNaoLidas || 0,
        total_mensagens: conversasPorLoja[l.id]?.mensagensCount || 0,
      }));

      // Ordena colocando lojas com mensagens recentes primeiro
      listaFinal.sort((a, b) => {
        const dateA = a.ultima_mensagem?.created_at ? new Date(a.ultima_mensagem.created_at).getTime() : 0;
        const dateB = b.ultima_mensagem?.created_at ? new Date(b.ultima_mensagem.created_at).getTime() : 0;
        return dateB - dateA;
      });

      return NextResponse.json({ conversas: listaFinal }, { headers: NO_CACHE_HEADERS });
    }

    // DETERMINA QUAL LOJA CONSULTAR
    let targetLojaId = usuario.loja_id;
    if (isSuperAdmin && requestedLojaId) {
      targetLojaId = requestedLojaId;
    }

    if (!targetLojaId) {
      return NextResponse.json({ mensagens: [], loja: null }, { headers: NO_CACHE_HEADERS });
    }

    // Busca detalhes da loja
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome, logo_url, telefone, subtitulo')
      .eq('id', targetLojaId)
      .maybeSingle();

    // Busca histórico completo de mensagens da loja
    const { data: mensagens, error } = await supabaseAdmin
      .from('chat_suporte_mensagens')
      .select('*')
      .eq('loja_id', targetLojaId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Aviso busca mensagens chat:', error.message);
      return NextResponse.json({ mensagens: [], loja: loja || null }, { headers: NO_CACHE_HEADERS });
    }

    return NextResponse.json({
      mensagens: mensagens || [],
      loja: loja || null,
      serverTime: new Date().toISOString(),
    }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('Erro ao buscar chat de suporte:', err);
    return NextResponse.json({ error: err?.message || 'Erro ao carregar chat.' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

/**
 * POST /api/chat-suporte
 * Salva mensagem permanentemente no banco e dispara e-mail de notificação.
 */
export async function POST(request: Request) {
  try {
    const usuario = await obterUsuario(request);
    if (!usuario) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401, headers: NO_CACHE_HEADERS });
    }

    const body = await request.json();
    const { mensagem, loja_id: overrideLojaId, anexo_url } = body;

    if (!mensagem || typeof mensagem !== 'string' || !mensagem.trim()) {
      return NextResponse.json({ error: 'Mensagem não pode ser vazia.' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const isSuperAdmin = usuario.role === 'super_admin' || usuario.email === 'guiguigamer125@gmail.com';
    const lojaId = (isSuperAdmin && overrideLojaId) ? overrideLojaId : usuario.loja_id;

    if (!lojaId) {
      return NextResponse.json({ error: 'Loja não identificada.' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    // Busca dados da loja
    const { data: loja } = await supabaseAdmin
      .from('lojas')
      .select('id, nome')
      .eq('id', lojaId)
      .maybeSingle();

    const nomeLoja = loja?.nome || 'Phone Center';
    const remetenteTipo = isSuperAdmin ? 'suporte' : 'cliente';
    const autorNome = usuario.nome || (isSuperAdmin ? 'Suporte Phone Center' : 'Lojista');
    const autorEmail = usuario.email;

    const messageId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const novaMensagem = {
      id: messageId,
      loja_id: lojaId,
      usuario_id: usuario.id,
      autor_nome: autorNome,
      autor_email: autorEmail,
      remetente: remetenteTipo,
      mensagem: mensagem.trim(),
      anexo_url: anexo_url || null,
      lida: false,
      created_at: new Date().toISOString(),
    };

    // Insere no banco com persistência total
    const { data: inserido, error: erroInsert } = await supabaseAdmin
      .from('chat_suporte_mensagens')
      .insert(novaMensagem)
      .select()
      .maybeSingle();

    if (erroInsert) {
      console.warn('Aviso inserção chat_suporte_mensagens:', erroInsert.message);
    }

    // DISPARO DE E-MAIL ASSÍNCRONO
    if (remetenteTipo === 'cliente') {
      // Notifica o time técnico/admin que um lojista enviou mensagem
      enviarMensagemChatSuporteParaAdminEmail({
        lojaId,
        nomeLoja,
        lojistaEmail: autorEmail,
        lojistaNome: autorNome,
        mensagem: mensagem.trim(),
      }).catch((e) => console.warn('Aviso envio e-mail suporte admin:', e));
    } else {
      // Suporte respondeu: busca o e-mail do lojista principal da loja para notificá-lo
      (async () => {
        try {
          const { data: perfilDono } = await supabaseAdmin
            .from('perfis')
            .select('email')
            .eq('loja_id', lojaId)
            .limit(1)
            .maybeSingle();

          const emailDestino = perfilDono?.email;
          if (emailDestino) {
            await enviarRespostaChatSuporteParaLojistaEmail({
              para: emailDestino,
              nomeLoja,
              atendenteNome: autorNome,
              mensagem: mensagem.trim(),
            });
          }
        } catch (e) {
          console.warn('Aviso envio e-mail resposta para lojista:', e);
        }
      })();
    }

    return NextResponse.json({
      success: true,
      mensagem: inserido || novaMensagem,
    }, { headers: NO_CACHE_HEADERS });
  } catch (err: any) {
    console.error('Erro ao enviar mensagem no chat de suporte:', err);
    return NextResponse.json({ error: err?.message || 'Falha ao enviar mensagem.' }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
