import { NextRequest, NextResponse } from 'next/server';
import {
  LEGACY_SESSION_COOKIES,
  SESSION_COOKIE,
  getSessionCookie,
  revocarSesion,
  sessionCookieOptions,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  const token = getSessionCookie(request);
  await revocarSesion(token).catch((err) =>
    console.warn('[logout] No se pudo revocar en BD:', err)
  );
  const response = NextResponse.json({ mensaje: 'Sesión cerrada' });
  const opciones = sessionCookieOptions();

  response.cookies.set(SESSION_COOKIE, '', { ...opciones, maxAge: 0 });

  for (const nombre of LEGACY_SESSION_COOKIES) {
    response.cookies.set(nombre, '', { path: '/', maxAge: 0 });
  }

  response.headers.set('Cache-Control', 'no-store');
  return response;
}
