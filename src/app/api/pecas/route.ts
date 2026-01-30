import { NextRequest, NextResponse } from "next/server";
import {
  getPecas,
  buscarPecas,
  createPeca,
} from "@/lib/db/pecas";

export async function GET(request: NextRequest) {
  try {
    const termo = request.nextUrl.searchParams.get("termo");

    if (termo) {
      // Buscar peças
      const pecas = await buscarPecas(termo);
      return NextResponse.json({
        success: true,
        data: pecas,
      });
    } else {
      // Listar todas
      const pecas = await getPecas();
      return NextResponse.json({
        success: true,
        data: pecas,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Erro ao buscar peças: ${error}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const dados = await request.json();

    // Validar campos obrigatórios
    if (!dados.codigoUnico || !dados.nome || dados.custoPeca === undefined || dados.vendaPeca === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "codigoUnico, nome, custoPeca e vendaPeca são obrigatórios",
        },
        { status: 400 }
      );
    }

    const novaPeca = await createPeca({
      ...dados,
      estoque: dados.estoque || 0,
      estoqueMinimo: dados.estoqueMinimo || 5,
      estoqueMaximo: dados.estoqueMaximo || 100,
      ativo: true,
    });

    return NextResponse.json(
      {
        success: true,
        data: novaPeca,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Erro ao criar peça: ${error}`,
      },
      { status: 500 }
    );
  }
}
