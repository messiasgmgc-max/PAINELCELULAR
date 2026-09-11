import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { CAMPOS_LOJA_RECIBO, idReciboValido, montarReciboPublico } from '@/lib/recibo/publico';

/**
 * Recibo público: aberto sem login por quem tem o link (WhatsApp, QR code).
 * Devolve só o que o recibo mostra; ver src/lib/recibo/publico.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const semCache = { 'Cache-Control': 'private, no-store' };

  try {
    const { id } = await params;
    if (!idReciboValido(id)) {
      return NextResponse.json({ error: 'Recibo não encontrado' }, { status: 404, headers: semCache });
    }

    const { data: venda, error: erroVenda } = await supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (erroVenda) throw erroVenda;
    if (!venda) {
      return NextResponse.json({ error: 'Recibo não encontrado' }, { status: 404, headers: semCache });
    }

    // Só a loja da própria venda. O fallback antigo ("primeira loja" ou "loja
    // personalizada") mostrava nome, CNPJ e Pix de outra loja no recibo.
    let loja: Record<string, unknown> | null = null;
    if (venda.loja_id) {
      const { data } = await supabaseAdmin
        .from('lojas')
        .select(CAMPOS_LOJA_RECIBO.join(', '))
        .eq('id', venda.loja_id)
        .maybeSingle();
      loja = data as unknown as Record<string, unknown> | null;
    }

    let cliente: Record<string, unknown> | null = null;
    const clienteId = venda.clienteId || venda.cliente_id;
    if (clienteId && venda.loja_id) {
      const { data } = await supabaseAdmin
        .from('clientes')
        .select('nome, cpf, telefone, email')
        .eq('id', clienteId)
        .eq('loja_id', venda.loja_id)
        .maybeSingle();
      cliente = data;
    }

    return NextResponse.json(montarReciboPublico(venda, loja, cliente), { headers: semCache });
  } catch (error) {
    console.error('Erro na API pública de recibo:', error);
    return NextResponse.json({ error: 'Erro ao carregar recibo' }, { status: 500, headers: semCache });
  }
}
