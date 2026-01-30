import { NextRequest, NextResponse } from "next/server";
import {
  getAparelhoById,
  updateAparelho,
  deleteAparelho,
} from "@/lib/db/aparelhos";
import { ApiResponse, Aparelho } from "@/lib/db/types";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const aparelho = await getAparelhoById(id);

    if (!aparelho) {
      return NextResponse.json(
        {
          success: false,
          error: "Aparelho não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<Aparelho> = {
      success: true,
      data: aparelho,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar aparelho",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const aparelhoAtualizado = await updateAparelho(id, body);

    if (!aparelhoAtualizado) {
      return NextResponse.json(
        {
          success: false,
          error: "Aparelho não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<Aparelho> = {
      success: true,
      data: aparelhoAtualizado,
      message: "Aparelho atualizado com sucesso",
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao atualizar aparelho",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const deletado = await deleteAparelho(id);

    if (!deletado) {
      return NextResponse.json(
        {
          success: false,
          error: "Aparelho não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<null> = {
      success: true,
      message: "Aparelho deletado com sucesso",
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao deletar aparelho",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}
