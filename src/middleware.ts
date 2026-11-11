import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest, Rol } from '@/lib/session';

/**
 * Middleware de control de acceso.
 * - Verifica la firma HMAC de la cookie de sesión.
 * - Falla cerrado: si no hay sesión válida, responde 401.
 * - Aplica RBAC para operaciones administrativas.
 *
 * Las rutas API vuelven a validar la sesión como defensa en profundidad.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Catálogo de salas: lectura pública (no contiene datos personales).
  if (pathname === '/api/salas' && method === 'GET') {
    return NextResponse.next();
  }

  // Catálogo de tipos de sala: requiere sesión; escritura solo administrador.
  if (pathname === '/api/tipos-sala' && method !== 'GET') {
    const sessionCheck = await getSessionFromRequest(request);
    if (!sessionCheck) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (sessionCheck.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'Acceso denegado: solo el Administrador puede gestionar tipos de sala' },
        { status: 403 }
      );
    }
    return NextResponse.next();
  }

  const session = await getSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const rolesStaff: Rol[] = ['encargado_administrativo', 'administrador'];

  // Gestionar salas (crear/editar/eliminar): solo administrador.
  if (
    pathname === '/api/salas' &&
    (method === 'POST' || method === 'PATCH' || method === 'DELETE') &&
    session.rol !== 'administrador'
  ) {
    return NextResponse.json(
      { error: 'Acceso denegado: solo el Administrador puede gestionar salas' },
      { status: 403 }
    );
  }

  // Bitácora administrativa: encargado o administrador.
  if (pathname.startsWith('/api/bitacora') && !rolesStaff.includes(session.rol)) {
    return NextResponse.json(
      { error: 'Acceso denegado: solo Encargados Administrativos pueden registrar bitácoras' },
      { status: 403 }
    );
  }

  // Check-in: cualquier usuario autenticado puede registrar su propia
  // asistencia. La ruta API verifica además la titularidad de la reserva
  // y permite al personal administrativo operar sobre terceros.

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/salas',
    '/api/tipos-sala',
    '/api/bitacora/:path*',
    '/api/reservas',
    '/api/reservas/:path*',
    '/api/usuarios/validar',
  ],
};
