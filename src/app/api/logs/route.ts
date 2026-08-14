import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lojaId = searchParams.get('lojaId');
    const tipo = searchParams.get('tipo');
    const termo = searchParams.get('termo');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    let query = supabase
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
    const { loja_id, usuario_id, usuario_email, usuario_nome, tipo_evento, acao, detalhes } = body;

    if (!acao) {
      return NextResponse.json({ error: 'A ação é obrigatória.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('logs_sistema')
      .insert({
        loja_id: loja_id || null,
        usuario_id: usuario_id || null,
        usuario_email: usuario_email || null,
        usuario_nome: usuario_nome || null,
        tipo_evento: tipo_evento || 'info',
        acao: String(acao).trim(),
        detalhes: detalhes ? String(detalhes).trim() : null,
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
