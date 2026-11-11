// ============================================================
// Sesión firmada (HMAC-SHA256) — compatible con Edge y Node
// ------------------------------------------------------------
// El rol y el RUT ya NO se leen de cookies editables por el cliente.
// Se guardan en un único token firmado; si alguien altera el valor,
// la verificación HMAC falla y la sesión se rechaza.
// ============================================================

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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padding = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET no configurado o con menos de 32 caracteres.');
  }
  return secret;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Crea un token de sesión firmado con el RUT y el rol. */
export async function signSession(input: { rut: string; rol: Rol }): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    rut: input.rut,
    rol: input.rol,
    iat: ahora,
    exp: ahora + SESSION_TTL_SECONDS,
  };

  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));

  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Verifica firma, formato y expiración. Devuelve null ante cualquier anomalía. */
export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [body, signature] = parts;

  try {
    const key = await importKey();
    const firmaValida = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signature) as unknown as BufferSource,
      encoder.encode(body)
    );

    if (!firmaValida) return null;

    const payload = JSON.parse(decoder.decode(base64UrlDecode(body))) as SessionPayload;

    if (
      !payload ||
      typeof payload.rut !== 'string' ||
      typeof payload.rol !== 'string' ||
      !ROLES_VALIDOS.includes(payload.rol as Rol) ||
      typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number'
    ) {
      return null;
    }

    const ahora = Math.floor(Date.now() / 1000);

    // Rechaza tokens vencidos, con fechas incoherentes o emitidos en el futuro.
    if (payload.exp <= ahora || payload.exp <= payload.iat || payload.iat > ahora + 60) {
      return null;
    }

    return payload;
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

/** Opciones de cookie seguras para el token de sesión. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
