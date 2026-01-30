import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get('sessao_usuario');

    if (!cookie || !cookie.value) {
      return NextResponse.json(
        { error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const usuario = JSON.parse(cookie.value);
    return NextResponse.json(usuario);
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao verificar sessão' },
      { status: 500 }
    );
  }
}
