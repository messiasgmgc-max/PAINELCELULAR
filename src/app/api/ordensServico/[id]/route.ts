import { NextRequest, NextResponse } from 'next/server';
import { 
  getOrdemServicoById, 
  updateOrdemServico, 
  deleteOrdemServico 
} from '@/lib/db/ordemServico';
import { ApiResponse } from '@/lib/db/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ordem = await getOrdemServicoById(id);

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const ordem = await updateOrdemServico(id, body);

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await deleteOrdemServico(id);

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
