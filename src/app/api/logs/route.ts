import { NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const acesso = await exigirAcesso(request, {});
    if (!acesso.ok) return acesso.resposta;
    // 'todas' só para o administrador da plataforma: os demais veem só a própria loja.
    const lojaId = acesso.usuario.superAdmin ? searchParams.get('lojaId') : acesso.usuario.lojaId;
    const tipo = searchParams.get('tipo');
    const termo = searchParams.get('termo');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = supabaseAdmin
      .from('logs_sistema')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (lojaId && lojaId !== 'todas') {
      query = query.eq('loja_id', lojaId);
    }

    if (tipo && tipo !== 'todos') {
      query = query.eq('tipo_evento', tipo);
    }

    if (termo && termo.trim()) {
      const cleanTerm = `%${termo.trim().toLowerCase()}%`;
      query = query.or(`acao.ilike.${cleanTerm},detalhes.ilike.${cleanTerm},usuario_email.ilike.${cleanTerm},usuario_nome.ilike.${cleanTerm}`);
    }

    const { data: logs, error } = await query;

    if (error) {
      // Se a tabela ainda não tiver sido criada pelo SQL
      if (error.code === '42P01') {
        return NextResponse.json({ logs: [] });
      }
      throw error;
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (error: any) {
    console.error('Erro na API de consulta de logs:', error);
    return NextResponse.json({ logs: [], error: error?.message }, { status: 500 });
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
