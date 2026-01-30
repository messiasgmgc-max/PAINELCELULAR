import { NextRequest, NextResponse } from "next/server";
import {
  getAparelhos,
  createAparelho,
  buscarAparelhos,
} from "@/lib/db/aparelhos";
import { ApiResponse, Aparelho } from "@/lib/db/types";

export async function GET(request: NextRequest) {
  try {
    // Busca por termo se houver query string
    const searchParams = request.nextUrl.searchParams;
    const termo = searchParams.get("termo");

    let aparelhos: Aparelho[];

    if (termo) {
      aparelhos = await buscarAparelhos(termo);
    } else {
      aparelhos = await getAparelhos();
    }

    const response: ApiResponse<Aparelho[]> = {
      success: true,
      data: aparelhos,
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao buscar aparelhos",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validação básica
    if (!body.marca || !body.modelo) {
      return NextResponse.json(
        {
          success: false,
          error: "Marca e modelo são obrigatórios",
        } as ApiResponse<null>,
        { status: 400 }
      );
    }

    const novoAparelho = await createAparelho({
      marca: body.marca,
      modelo: body.modelo,
      imei: body.imei || "",
      numeroSerie: body.numeroSerie || "",
      cor: body.cor || "",
      capacidade: body.capacidade || "",
      condicao: body.condicao || "seminovo",
      preco: body.preco || 0,
      descricao: body.descricao || "",
      cliente: body.cliente || "",
      clienteId: body.clienteId || "",
      acessorios: body.acessorios || "",
      observacoes: body.observacoes || "",
      ativo: body.ativo !== false,
    });

    const response: ApiResponse<Aparelho> = {
      success: true,
      data: novoAparelho,
      message: "Aparelho criado com sucesso",
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao criar aparelho",
      } as ApiResponse<null>,
      { status: 500 }
    );
  }
}
