// ============================================================
// Sesión: JWT HS256 estándar (RFC 7519) con jose — Edge + Node
// ------------------------------------------------------------
// Formato: header.payload.signature (3 partes), cabecera
// { alg: 'HS256', typ: 'JWT' }. Firma HMAC-SHA256 sobre
// `${header}.${payload}` con SESSION_SECRET (>= 32 caracteres).
// Un cambio en cualquier parte del token rompe la verificación.
// ============================================================

import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export type Rol = 'alumno' | 'docente' | 'encargado_administrativo' | 'administrador';

const ROLES_VALIDOS: Rol[] = ['alumno', 'docente', 'encargado_administrativo', 'administrador'];

export interface SessionPayload {
  rut: string;
  rol: Rol;
  iat: number;
  exp: number;
}

export const SESSION_COOKIE = 'institucion_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 horas
export const LEGACY_SESSION_COOKIES = [
  'inacap_session_rol',
  'inacap_session_rut',
  'inacap_session',
];

const JWT_ALG = 'HS256' as const;
const JWT_ISSUER = 'sistema-reservas-inacap';
const JWT_AUDIENCE = 'institucion-app';

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET no configurado o con menos de 32 caracteres.');
  }
  return new TextEncoder().encode(secret);
}

/** Emite un JWT HS256 firmado con el RUT y el rol del usuario. */
export async function signSession(input: { rut: string; rol: Rol }): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);

  return new SignJWT({ rut: input.rut, rol: input.rol })
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setIssuedAt(ahora)
    .setExpirationTime(ahora + SESSION_TTL_SECONDS)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .sign(getSecretKey());
}

/**
 * Verifica cabecera (alg HS256), firma, issuer, audience, expiración y
 * coherencia de fechas. Devuelve null ante cualquier anomalía.
 */
export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: [JWT_ALG],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (
      typeof payload.rut !== 'string' ||
      typeof payload.rol !== 'string' ||
      !ROLES_VALIDOS.includes(payload.rol as Rol) ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    const ahora = Math.floor(Date.now() / 1000);
    // jwtVerify ya rechaza exp <= ahora; estas dos comprobaciones cubren
    // tokens con fechas incoherentes o emitidos en el futuro.
    if (payload.exp <= payload.iat || payload.iat > ahora + 60) {
      return null;
    }

    return {
      rut: payload.rut,
      rol: payload.rol as Rol,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getSessionCookie(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE)?.value;
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  return verifySession(getSessionCookie(request));
}

/** Opciones de cookie seguras para el token JWT de sesión. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
