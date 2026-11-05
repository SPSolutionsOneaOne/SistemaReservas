import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware de Control de Acceso basado en Roles (RBAC - RF-SEC-11 / RN03)
 * Protege endpoints y vistas sensibles según el rol detectado.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userRole = request.cookies.get('inacap_session_rol')?.value;

  // 1. Proteger creación de salas (Solo Administrador)
  if (pathname === '/api/salas' && request.method === 'POST') {
    if (userRole && userRole !== 'administrador') {
      return NextResponse.json(
        { error: 'Acceso denegado: solo el Administrador puede crear salas (RF-SEC-11)' },
        { status: 403 }
      );
    }
  }

  // 2. Proteger Bitácora Administrativa (Solo Encargado Administrativo y Administrador)
  if (pathname.startsWith('/api/bitacora')) {
    if (
      userRole &&
      userRole !== 'encargado_administrativo' &&
      userRole !== 'administrador'
    ) {
      return NextResponse.json(
        { error: 'Acceso denegado: solo Encargados Administrativos pueden registrar bitácoras (RF-SEC-04)' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/salas', '/api/bitacora/:path*'],
};
