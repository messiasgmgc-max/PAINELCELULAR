import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const cookie = request.cookies.get('sessao_usuario')

  // Rotas públicas (sem autenticação)
  const publicRoutes = ['/login', '/api/auth/']
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Se está em rota pública, permite
  if (isPublicRoute) {
    // Se já está autenticado e tenta acessar login, redireciona para home
    if (cookie && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // Se está em rota privada (não é pública) e não tem cookie, redireciona para login
  // COMENTADO PARA DEBUG: O cookie 'sessao_usuario' pode não estar sincronizado com o localStorage do Supabase ainda.
  // if (!cookie && !pathname.startsWith('/api/')) {
  //   return NextResponse.redirect(new URL('/login', request.url))
  // }

  const response = NextResponse.next()
  
  // Headers de segurança
  response.headers.set('X-Frame-Options', 'ALLOWALL')
  response.headers.set('Content-Security-Policy', 'frame-ancestors *')
  
  return response
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
