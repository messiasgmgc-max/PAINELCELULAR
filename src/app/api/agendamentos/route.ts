import { NextRequest, NextResponse } from 'next/server';
import { getAgendamentos, createAgendamento, buscarAgendamentos } from '@/lib/db/agendamentos';
import { Agendamento } from '@/lib/db/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const termo = searchParams.get('termo');

    let agendamentos: Agendamento[];
    
    if (termo) {
      agendamentos = buscarAgendamentos(termo);
    } else {
      agendamentos = getAgendamentos();
    }

    return NextResponse.json(agendamentos);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao buscar agendamentos' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const dados = await request.json();

    if (!dados.clienteId || !dados.clienteNome || !dados.data) {
      return NextResponse.json(
        { error: 'Cliente, nome e data são obrigatórios' },
        { status: 400 }
      );
    }

    const novoAgendamento = createAgendamento({
      clienteId: dados.clienteId,
      clienteNome: dados.clienteNome,
      telefone: dados.telefone || '',
      data: dados.data,
      descricao: dados.descricao,
      tecnicoId: dados.tecnicoId,
      tecnicoNome: dados.tecnicoNome,
      aparelhoId: dados.aparelhoId,
      aparelhoDescricao: dados.aparelhoDescricao,
      status: dados.status || 'agendado',
      observacoes: dados.observacoes
    });

    return NextResponse.json(novoAgendamento, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao criar agendamento' },
      { status: 500 }
    );
  }
}
