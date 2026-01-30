import { NextRequest, NextResponse } from 'next/server';
import { validarSenha } from '@/lib/db/usuarios';

const COOKIE_NAME = 'sessao_usuario';
const COOKIE_EXPIRES = 7 * 24 * 60 * 60; // 7 dias em segundos

export async function POST(request: NextRequest) {
  try {
    const { email, senha } = await request.json();

    if (!email || !senha) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const usuario = await validarSenha(email, senha);

    if (!usuario) {
      return NextResponse.json(
        { error: 'Email ou senha inválidos' },
        { status: 401 }
      );
    }

    // Criar resposta com cookie
    const response = NextResponse.json(usuario, { status: 200 });
    
    response.cookies.set(COOKIE_NAME, JSON.stringify(usuario), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_EXPIRES,
      path: '/'
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao fazer login' },
      { status: 500 }
    );
  }
}
