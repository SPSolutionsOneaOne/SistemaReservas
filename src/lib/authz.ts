// ============================================================
// Autorización por rol para rutas API (defensa en profundidad)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, Rol, SessionPayload } from '@/lib/session';

export type AuthResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; response: NextResponse };

/**
 * Verifica que exista una sesión válida y, opcionalmente, que el rol
 * esté dentro de los permitidos. Siempre falla cerrado.
 */
export async function authorize(request: NextRequest, roles?: Rol[]): Promise<AuthResult> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }),
    };
  }

  if (roles && roles.length > 0 && !roles.includes(session.rol)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }),
    };
  }

  return { ok: true, session };
}

export const ROLES_STAFF: Rol[] = ['encargado_administrativo', 'administrador'];
