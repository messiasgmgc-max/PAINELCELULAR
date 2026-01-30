import { NextRequest, NextResponse } from 'next/server';
import { criarUsuario } from '@/lib/db/usuarios';

const COOKIE_NAME = 'sessao_usuario';
const COOKIE_EXPIRES = 7 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const { email, senha, nome } = await request.json();

    if (!email || !senha || !nome) {
      return NextResponse.json(
        { error: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      );
    }

    // Validar força da senha
    if (senha.length < 6) {
      return NextResponse.json(
        { error: 'Senha deve ter no mínimo 6 caracteres' },
        { status: 400 }
      );
    }

    const usuario = await criarUsuario(email, senha, nome);

    if (!usuario) {
      return NextResponse.json(
        { error: 'Email já está registrado' },
        { status: 409 }
      );
    }

    // Criar resposta com cookie
    const sessao = {
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role
    };

    const response = NextResponse.json(sessao, { status: 201 });
    
    response.cookies.set(COOKIE_NAME, JSON.stringify(sessao), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_EXPIRES,
      path: '/'
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao registrar usuário' },
      { status: 500 }
    );
  }
}
