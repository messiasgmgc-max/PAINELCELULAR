import { NextRequest, NextResponse } from 'next/server';
import { getGarantias, createGarantia, buscarGarantias } from '@/lib/db/garantias';
import { Garantia } from '@/lib/db/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const termo = searchParams.get('termo');

    let garantias: Garantia[];
    
    if (termo) {
      garantias = buscarGarantias(termo);
    } else {
      garantias = getGarantias();
    }

    return NextResponse.json(garantias);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar garantias' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const dados = await request.json();

    if (!dados.osId || !dados.osNumero || !dados.clienteId || !dados.clienteNome || !dados.dataInicio || !dados.diasGarantia) {
      return NextResponse.json(
        { error: 'OS, cliente, data de início e dias de garantia são obrigatórios' },
        { status: 400 }
      );
    }

    const novaGarantia = createGarantia({
      osId: dados.osId,
      osNumero: dados.osNumero,
      clienteId: dados.clienteId,
      clienteNome: dados.clienteNome,
      aparelhoDescricao: dados.aparelhoDescricao,
      dataInicio: dados.dataInicio,
      diasGarantia: dados.diasGarantia,
      descricao: dados.descricao,
      historico: dados.historico || [],
      ativo: true
    });

    return NextResponse.json(novaGarantia, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao criar garantia' },
      { status: 500 }
    );
  }
}
