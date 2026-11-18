import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { lojaEfetiva } from '@/lib/auth/acesso';
import { exigirAcesso } from '@/lib/auth/servidor';
import {
  notificarSaidaVendaGrupoEstoque,
  type AparelhoNotificacaoSaida,
} from '@/lib/whatsapp/notificarSaidaEstoque';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const {
      lojaId,
      clienteNome,
      aparelhos,
      loteId,
    }: {
      lojaId?: string | null;
      clienteNome?: string | null;
      aparelhos?: AparelhoNotificacaoSaida[];
      loteId?: string | null;
    } = body || {};

    const acesso = await exigirAcesso(request, { lojaId: lojaId || null });
    if (!acesso.ok) return acesso.resposta;

    if (!Array.isArray(aparelhos) || aparelhos.length === 0) {
      return NextResponse.json({ success: false, enviado: false, mensagens: [] });
    }

    const lojaEfetivaId = lojaEfetiva(acesso.usuario, lojaId) || lojaId || null;
    const resultado = await notificarSaidaVendaGrupoEstoque({
      supabase: supabaseAdmin,
      lojaId: lojaEfetivaId,
      clienteNome: clienteNome || 'Cliente',
      aparelhos,
      loteId: loteId || null,
    });

    return NextResponse.json({
      success: true,
      ...resultado,
    });
  } catch (err: any) {
    console.error('[Notificar Saída Venda] Erro inesperado:', err);
    return NextResponse.json(
      { error: err?.message || 'Erro ao notificar saída de venda no grupo ESTOQUE' },
      { status: 500 }
    );
  }
}
