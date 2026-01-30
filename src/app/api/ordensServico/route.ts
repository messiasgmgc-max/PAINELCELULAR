import { NextRequest, NextResponse } from 'next/server';
import { 
  getOrdensServico, 
  createOrdemServico, 
  buscarOrdensServico 
} from '@/lib/db/ordemServico';
import { ApiResponse } from '@/lib/db/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const termo = searchParams.get('termo');

    let ordens;
    if (termo) {
      ordens = await buscarOrdensServico(termo);
    } else {
      ordens = await getOrdensServico();
    }

    const response: ApiResponse<any> = {
      success: true,
      data: ordens
    };

    return NextResponse.json(response);
  } catch (error: any) {
    const response: ApiResponse<any> = {
      success: false,
      error: error.message
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar campos obrigatórios
    if (!body.clienteId || !body.clienteNome || !body.defeito) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'clienteId, clienteNome e defeito são obrigatórios'
      };
      return NextResponse.json(response, { status: 400 });
    }

    const novaOrdem = await createOrdemServico(body);

    const response: ApiResponse<any> = {
      success: true,
      data: novaOrdem,
      message: `Ordem de Serviço #${novaOrdem.numeroOS} criada com sucesso`
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    const response: ApiResponse<any> = {
      success: false,
      error: error.message
    };
    return NextResponse.json(response, { status: 500 });
  }
}
