import { NextResponse } from 'next/server';
import {
  LEGACY_SESSION_COOKIES,
  SESSION_COOKIE,
  sessionCookieOptions,
} from '@/lib/session';

export async function POST() {
  const response = NextResponse.json({ mensaje: 'Sesión cerrada' });
  const opciones = sessionCookieOptions();

  response.cookies.set(SESSION_COOKIE, '', { ...opciones, maxAge: 0 });

  for (const nombre of LEGACY_SESSION_COOKIES) {
    response.cookies.set(nombre, '', { path: '/', maxAge: 0 });
  }

  response.headers.set('Cache-Control', 'no-store');
  return response;
}
