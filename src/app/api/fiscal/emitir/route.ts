import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/integrations/supabase/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { processarEmissaoFiscal } from '@/lib/fiscal/fiscalService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vendaId, tipo = 'nfce', lojaId, destinatario } = body;

    if (!vendaId) {
      return NextResponse.json({ sucesso: false, mensagem: 'vendaId é obrigatório' }, { status: 400 });
    }

    const acesso = await exigirAcesso(req, { lojaId: lojaId || null });
    if (!acesso.ok) return acesso.resposta;

    // A nota é da venda: ela precisa ser da loja de quem pede.
    const { data: vendaDaNota } = await supabaseAdmin.from('vendas').select('loja_id').eq('id', String(vendaId)).maybeSingle();
    if (vendaDaNota && !acesso.usuario.superAdmin && vendaDaNota.loja_id !== acesso.usuario.lojaId) {
      return NextResponse.json({ sucesso: false, mensagem: 'Esta venda não é da sua loja.' }, { status: 403 });
    }

    const resultado = await processarEmissaoFiscal({
      vendaId: String(vendaId),
      tipo,
      lojaId,
      destinatario
    });

    return NextResponse.json(resultado, { status: 200 });
  } catch (error: any) {
    console.error('Erro na rota /api/fiscal/emitir:', error);
    return NextResponse.json({
      sucesso: false,
      status: 'erro_autorizacao',
      mensagem: error?.message || 'Erro interno na emissão fiscal'
    }, { status: 500 });
  }
}
