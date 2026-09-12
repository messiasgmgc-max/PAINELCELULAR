import { NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { filtroTextoLogs, lerFiltrosLogs, separarPagina } from '@/lib/auditoria/filtros';

/**
 * GET /api/logs — atividades gravadas pelo app (logs_sistema), paginadas e
 * filtradas no servidor: período, tipo, usuário e texto/IMEI. Sempre restrito
 * à loja do usuário; só o administrador da plataforma escolhe a loja.
 * Resposta: { logs, temMais, proximoOffset, total }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const acesso = await exigirAcesso(request, {});
    if (!acesso.ok) return acesso.resposta;

    const filtros = lerFiltrosLogs(searchParams, acesso.usuario);
    if (!filtros.lojaId && !acesso.usuario.superAdmin) {
      return NextResponse.json({ logs: [], temMais: false, proximoOffset: 0, total: 0, error: 'Seu usuário não está ligado a nenhuma loja.' }, { status: 403 });
    }

    // Uma linha a mais para saber se existe próxima página; contagem só na primeira.
    let query = supabaseAdmin
      .from('logs_sistema')
      .select('*', { count: filtros.offset === 0 ? 'exact' : undefined })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(filtros.offset, filtros.offset + filtros.limite);

    if (filtros.lojaId) query = query.eq('loja_id', filtros.lojaId);
    if (filtros.tipo) query = query.eq('tipo_evento', filtros.tipo);
    if (filtros.usuario) query = query.ilike('usuario_email', filtros.usuario);
    if (filtros.inicio) query = query.gte('created_at', filtros.inicio);
    if (filtros.fim) query = query.lte('created_at', filtros.fim);
    const filtroTexto = filtroTextoLogs(filtros.termo);
    if (filtroTexto) query = query.or(filtroTexto);

    const { data, error, count } = await query;

    if (error) {
      // Se a tabela ainda não tiver sido criada pelo SQL
      if (error.code === '42P01') {
        return NextResponse.json({ logs: [], temMais: false, proximoOffset: 0, total: 0 });
      }
      throw error;
    }

    const pagina = separarPagina(data || [], filtros.limite, filtros.offset);
    return NextResponse.json({
      logs: pagina.itens,
      temMais: pagina.temMais,
      proximoOffset: pagina.proximoOffset,
      total: typeof count === 'number' ? count : null,
    });
  } catch (error: any) {
    console.error('Erro na API de consulta de logs:', error);
    return NextResponse.json({ logs: [], temMais: false, proximoOffset: 0, error: error?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { loja_id, usuario_id, usuario_email, usuario_nome, tipo_evento, acao, detalhes, valor_anterior, valor_novo } = body;

    const acesso = await exigirAcesso(request, {});
    if (!acesso.ok) return acesso.resposta;

    if (!acao) {
      return NextResponse.json({ error: 'A ação é obrigatória.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('logs_sistema')
      .insert({
        loja_id: acesso.usuario.superAdmin ? loja_id || null : acesso.usuario.lojaId,
        usuario_id: usuario_id || null,
        usuario_email: usuario_email || null,
        usuario_nome: usuario_nome || null,
        tipo_evento: tipo_evento || 'info',
        acao: String(acao).trim(),
        detalhes: detalhes ? String(detalhes).trim() : null,
        // Sem isto, o fallback descartava o antes/depois das operações em massa.
        valor_anterior: valor_anterior ?? null,
        valor_novo: valor_novo ?? null,
      })
      .select()
      .single();

    if (error) {
      console.warn('Aviso ao salvar log no BD:', error.message);
      return NextResponse.json({ ok: false, warning: error.message });
    }

    return NextResponse.json({ ok: true, log: data }, { status: 201 });
  } catch (error: any) {
    console.error('Erro na API de inserção de log:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao registrar log' }, { status: 500 });
  }
}
