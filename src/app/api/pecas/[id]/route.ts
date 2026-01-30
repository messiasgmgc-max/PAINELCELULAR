import { NextRequest, NextResponse } from "next/server";
import {
  getPecaById,
  updatePeca,
  deletePeca,
} from "@/lib/db/pecas";

interface Params {
  id: string;
}

export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = params;
    const peca = await getPecaById(id);

    if (!peca) {
      return NextResponse.json(
        {
          success: false,
          error: "Peça não encontrada",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: peca,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Erro ao buscar peça: ${error}`,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = params;
    const dados = await request.json();

    const pecaAtualizada = await updatePeca(id, dados);

    if (!pecaAtualizada) {
      return NextResponse.json(
        {
          success: false,
          error: "Peça não encontrada",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: pecaAtualizada,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Erro ao atualizar peça: ${error}`,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = params;
    const deletado = await deletePeca(id);

    if (!deletado) {
      return NextResponse.json(
        {
          success: false,
          error: "Peça não encontrada",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Peça deletada com sucesso",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Erro ao deletar peça: ${error}`,
      },
      { status: 500 }
    );
  }
}
