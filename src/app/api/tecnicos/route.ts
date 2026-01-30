import { NextRequest, NextResponse } from 'next/server';
import { 
  getTecnicos, 
  createTecnico, 
  buscarTecnicos 
} from '@/lib/db/tecnicos';
import { ApiResponse } from '@/lib/db/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const termo = searchParams.get('termo');

    let tecnicos;
    if (termo) {
      tecnicos = await buscarTecnicos(termo);
    } else {
      tecnicos = await getTecnicos();
    }

    const response: ApiResponse<any> = {
      success: true,
      data: tecnicos
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
    if (!body.nome || !body.telefone) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'nome e telefone são obrigatórios'
      };
      return NextResponse.json(response, { status: 400 });
    }

    const novoTecnico = await createTecnico(body);

    const response: ApiResponse<any> = {
      success: true,
      data: novoTecnico,
      message: `Técnico ${novoTecnico.nome} criado com sucesso`
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
