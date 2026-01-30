import { NextRequest, NextResponse } from "next/server";
import {
  getClientes,
  createCliente,
  buscarClientes,
} from "@/lib/db/clients";
import { ApiResponse, Cliente } from "@/lib/db/types";

export async function GET(request: NextRequest) {
  try {
    // Busca por termo se houver query string
    const searchParams = request.nextUrl.searchParams;
    const termo = searchParams.get("termo");

    let clientes: Cliente[];

    if (termo) {
      clientes = await buscarClientes(termo);
    } else {
      clientes = await getClientes();
    }

    const response: ApiResponse<Cliente[]> = {
      success: true,
      data: clientes,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar clientes",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validação básica
    if (!body.nome || !body.email || !body.telefone) {
      return NextResponse.json(
        {
          success: false,
          error: "Nome, email e telefone são obrigatórios",
        } as ApiResponse<null>,
        { status: 400 }
      );
    }

    const novoCliente = await createCliente({
      nome: body.nome,
      email: body.email,
      telefone: body.telefone,
      cpf: body.cpf || "",
      endereco: body.endereco || "",
      cidade: body.cidade || "",
      estado: body.estado || "",
      cep: body.cep || "",
      ativo: body.ativo !== false,
    });

    const response: ApiResponse<Cliente> = {
      success: true,
      data: novoCliente,
      message: "Cliente criado com sucesso",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao criar cliente",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}
