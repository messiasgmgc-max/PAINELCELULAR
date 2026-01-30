import { NextRequest, NextResponse } from 'next/server';
import { 
  getOrdemServicoById, 
  updateOrdemServico, 
  deleteOrdemServico 
} from '@/lib/db/ordemServico';
import { ApiResponse } from '@/lib/db/types';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ordem = await getOrdemServicoById(params.id);

    if (!ordem) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Ordem de Serviço não encontrada'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: ordem
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
    const ordem = await updateOrdemServico(params.id, body);

    if (!ordem) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Ordem de Serviço não encontrada'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      data: ordem,
      message: 'Ordem de Serviço atualizada com sucesso'
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
    const deleted = await deleteOrdemServico(params.id);

    if (!deleted) {
      const response: ApiResponse<any> = {
        success: false,
        error: 'Ordem de Serviço não encontrada'
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<any> = {
      success: true,
      message: 'Ordem de Serviço deletada com sucesso'
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
