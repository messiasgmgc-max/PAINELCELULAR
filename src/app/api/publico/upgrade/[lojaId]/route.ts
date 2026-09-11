import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import {
  CAMPOS_MOTOBOY_COLETA,
  CAMPOS_PROPOSTA_COLETA,
  STATUS_PROPOSTA_ABERTA,
  idValido,
  montarAvaliacaoPublica,
  montarVistoriaPublica,
} from '@/lib/upgrade/publico';

/**
 * Leitura e gravação das páginas públicas /avaliar e /coleta (sem login).
 * Ver src/lib/upgrade/publico.ts.
 */

const semCache = { 'Cache-Control': 'private, no-store' };

async function lojaAtiva(lojaId: string) {
  if (!idValido(lojaId)) return null;
  const { data, error } = await supabaseAdmin.rpc('loja_publica', { p_loja_id: lojaId });
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ lojaId: string }> }) {
  try {
    const { lojaId } = await params;
    const loja = await lojaAtiva(lojaId);
    if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404, headers: semCache });

    const [motoboys, propostas] = await Promise.all([
      supabaseAdmin
        .from('motoboys')
        .select(CAMPOS_MOTOBOY_COLETA.join(', '))
        .eq('loja_id', lojaId)
        .eq('ativo', true)
        .order('nome'),
      supabaseAdmin
        .from('avaliacoes_upgrade')
        .select(CAMPOS_PROPOSTA_COLETA.join(', '))
        .eq('loja_id', lojaId)
        .in('status', [...STATUS_PROPOSTA_ABERTA])
        .order('created_at', { ascending: false })
        .limit(10),
    ]);
    if (motoboys.error) throw motoboys.error;
    if (propostas.error) throw propostas.error;

    return NextResponse.json(
      { loja, motoboys: motoboys.data || [], propostas: propostas.data || [] },
      { headers: semCache }
    );
  } catch (err) {
    console.error('[publico/upgrade] GET', err);
    return NextResponse.json({ error: 'Não foi possível carregar os dados da loja.' }, { status: 500, headers: semCache });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ lojaId: string }> }) {
  try {
    const { lojaId } = await params;
    const loja = await lojaAtiva(lojaId);
    if (!loja) return NextResponse.json({ error: 'Loja não encontrada' }, { status: 404, headers: semCache });

    const corpo = await request.json().catch(() => null);
    const tipo = corpo?.tipo;

    if (tipo === 'avaliacao') {
      const resultado = montarAvaliacaoPublica(lojaId, corpo.dados);
      if (!resultado.ok) return NextResponse.json({ error: resultado.erro }, { status: 400, headers: semCache });
      const { error } = await supabaseAdmin.from('avaliacoes_upgrade').insert(resultado.registro);
      if (error) throw error;
      return NextResponse.json({ ok: true }, { headers: semCache });
    }

    if (tipo === 'vistoria') {
      const resultado = montarVistoriaPublica(lojaId, corpo.dados);
      if (!resultado.ok) return NextResponse.json({ error: resultado.erro }, { status: 400, headers: semCache });
      const vistoria = resultado.registro;

      const { error } = await supabaseAdmin.from('vistorias_upgrade').insert(vistoria);
      if (error) throw error;

      // Proposta vinculada: só da mesma loja e ainda em aberto.
      if (vistoria.avaliacao_id) {
        const { error: erroProposta } = await supabaseAdmin
          .from('avaliacoes_upgrade')
          .update({ status: 'em_negociacao', valor_aprovado: vistoria.valor_acordado })
          .eq('id', vistoria.avaliacao_id as string)
          .eq('loja_id', lojaId)
          .in('status', [...STATUS_PROPOSTA_ABERTA]);
        if (erroProposta) console.error('[publico/upgrade] proposta vinculada', erroProposta);
      }
      return NextResponse.json({ ok: true }, { headers: semCache });
    }

    return NextResponse.json({ error: 'Tipo de envio inválido.' }, { status: 400, headers: semCache });
  } catch (err) {
    console.error('[publico/upgrade] POST', err);
    return NextResponse.json({ error: 'Não foi possível salvar. Tente de novo.' }, { status: 500, headers: semCache });
  }
}
