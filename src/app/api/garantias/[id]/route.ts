import { NextRequest, NextResponse } from 'next/server';
import { getGarantiaById, updateGarantia, deleteGarantia } from '@/lib/db/garantias';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const garantia = getGarantiaById(params.id);

    if (!garantia) {
      return NextResponse.json(
        { error: 'Garantia não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(garantia);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar garantia' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dados = await request.json();
    const garantiaAtualizada = updateGarantia(params.id, dados);

    if (!garantiaAtualizada) {
      return NextResponse.json(
        { error: 'Garantia não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(garantiaAtualizada);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao atualizar garantia' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteGarantia(params.id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Garantia não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao deletar garantia' },
      { status: 500 }
    );
  }
}
