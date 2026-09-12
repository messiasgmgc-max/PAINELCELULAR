import { NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { lerFiltrosLogs, separarPagina } from '@/lib/auditoria/filtros';
import { classificarBusca, filtroBuscaAuditoria, montarLinhaDoTempo, TABELAS_AUDITADAS, type LinhaAuditoria } from '@/lib/auditoria/linhaDoTempo';

/**
 * GET /api/auditoria — linha do tempo gravada por trigger em public.auditoria
 * (migration 20260913_dados_auditoria.sql). Parâmetros: termo (IMEI, id do
 * registro ou texto), tabela, inicio, fim, offset; lojaId só para o
 * administrador da plataforma. Resposta: { eventos, temMais, proximoOffset, busca }.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const acesso = await exigirAcesso(request, {});
    if (!acesso.ok) return acesso.resposta;

    const filtros = lerFiltrosLogs(searchParams, acesso.usuario);
    if (!filtros.lojaId && !acesso.usuario.superAdmin) {
      return NextResponse.json({ eventos: [], temMais: false, proximoOffset: 0, error: 'Seu usuário não está ligado a nenhuma loja.' }, { status: 403 });
    }

    const tabela = (searchParams.get('tabela') || '').trim();
    const busca = classificarBusca(filtros.termo);

    let query = supabaseAdmin
      .from('auditoria')
      .select('*')
      .order('criado_em', { ascending: false })
      .order('id', { ascending: false })
      .range(filtros.offset, filtros.offset + filtros.limite);

    if (filtros.lojaId) query = query.eq('loja_id', filtros.lojaId);
    if ((TABELAS_AUDITADAS as readonly string[]).includes(tabela)) query = query.eq('tabela', tabela);
    if (filtros.usuario) query = query.ilike('usuario_email', filtros.usuario);
    if (filtros.inicio) query = query.gte('criado_em', filtros.inicio);
    if (filtros.fim) query = query.lte('criado_em', filtros.fim);
    const filtroBusca = filtroBuscaAuditoria(busca);
    if (filtroBusca) query = query.or(filtroBusca);

    const { data, error } = await query;
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ eventos: [], temMais: false, proximoOffset: 0, busca, aviso: 'A trilha de auditoria ainda não foi instalada no banco (migration 20260913_dados_auditoria).' });
      }
      throw error;
    }

    const pagina = separarPagina((data || []) as LinhaAuditoria[], filtros.limite, filtros.offset);
    return NextResponse.json({
      eventos: montarLinhaDoTempo(pagina.itens),
      temMais: pagina.temMais,
      proximoOffset: pagina.proximoOffset,
      busca,
    });
  } catch (error: any) {
    console.error('Erro na API de auditoria:', error);
    return NextResponse.json({ eventos: [], temMais: false, proximoOffset: 0, error: error?.message }, { status: 500 });
  }
}
