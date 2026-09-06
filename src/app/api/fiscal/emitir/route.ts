import { NextRequest, NextResponse } from 'next/server';
import { processarEmissaoFiscal } from '@/lib/fiscal/fiscalService';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vendaId, tipo = 'nfce', lojaId, destinatario } = body;

    if (!vendaId) {
      return NextResponse.json({ sucesso: false, mensagem: 'vendaId é obrigatório' }, { status: 400 });
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
