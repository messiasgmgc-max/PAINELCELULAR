import { NextRequest, NextResponse } from 'next/server';
import { 
  getTecnicoById, 
  updateTecnico, 
  deleteTecnico 
} from '@/lib/db/tecnicos';
import { ApiResponse } from '@/lib/db/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const tecnico = await getTecnicoById(params.id);

    if (!tecnico) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Técnico não encontrado'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: tecnico
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

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const tecnico = await updateTecnico(params.id, body);

    if (!tecnico) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Técnico não encontrado'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: tecnico,
      message: 'Técnico atualizado com sucesso'
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = await deleteTecnico(params.id);

    if (!deleted) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Técnico não encontrado'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      message: 'Técnico deletado com sucesso'
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
