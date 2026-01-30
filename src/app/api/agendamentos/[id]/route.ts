import { NextRequest, NextResponse } from 'next/server';
import { getAgendamentoById, updateAgendamento, deleteAgendamento } from '@/lib/db/agendamentos';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agendamento = getAgendamentoById(params.id);

    if (!agendamento) {
      return NextResponse.json(
        { error: 'Agendamento não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(agendamento);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar agendamento' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dados = await request.json();
    const agendamentoAtualizado = updateAgendamento(params.id, dados);

    if (!agendamentoAtualizado) {
      return NextResponse.json(
        { error: 'Agendamento não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(agendamentoAtualizado);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao atualizar agendamento' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteAgendamento(params.id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Agendamento não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao deletar agendamento' },
      { status: 500 }
    );
  }
}
