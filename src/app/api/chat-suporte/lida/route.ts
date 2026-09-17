import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    const body = await request.json();
    const { loja_id, remetente_para_marcar } = body;

    if (!loja_id) {
      return NextResponse.json({ error: 'Loja ID obrigatório.' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('chat_suporte_mensagens')
      .update({ lida: true })
      .eq('loja_id', loja_id)
      .eq('lida', false);

    if (remetente_para_marcar) {
      query = query.eq('remetente', remetente_para_marcar);
    }

    await query;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Erro ao marcar mensagens como lidas.' }, { status: 500 });
  }
}
