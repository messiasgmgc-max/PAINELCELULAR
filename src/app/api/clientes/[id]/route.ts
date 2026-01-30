import { NextRequest, NextResponse } from "next/server";
import {
  getClienteById,
  updateCliente,
  deleteCliente,
} from "@/lib/db/clients";
import { ApiResponse, Cliente } from "@/lib/db/types";

interface Params {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const cliente = await getClienteById(id);

    if (!cliente) {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<Cliente> = {
      success: true,
      data: cliente,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar cliente",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const clienteAtualizado = await updateCliente(id, body);

    if (!clienteAtualizado) {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<Cliente> = {
      success: true,
      data: clienteAtualizado,
      message: "Cliente atualizado com sucesso",
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao atualizar cliente",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const deletado = await deleteCliente(id);

    if (!deletado) {
      return NextResponse.json(
        {
          success: false,
          error: "Cliente não encontrado",
        } as ApiResponse<null>,
        { status: 404 }
      );
    }

    const response: ApiResponse<null> = {
      success: true,
      message: "Cliente deletado com sucesso",
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao deletar cliente",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}
