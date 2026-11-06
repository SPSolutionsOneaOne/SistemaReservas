import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseInstitucionalAdmin } from '@/lib/supabaseInstitucionalAdmin';
import argon2 from 'argon2';
import {
  LEGACY_SESSION_COOKIES,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  Rol,
} from '@/lib/session';
import { limpiarIntentos, obtenerClaveCliente, registrarFallo, verificarBloqueo } from '@/lib/rateLimit';

const MENSAJE_CREDENCIALES = 'Credenciales inválidas o usuario no encontrado';

export async function POST(request: NextRequest) {
  const claveCliente = `login:${obtenerClaveCliente(request)}`;

  try {
    const bloqueo = await verificarBloqueo(claveCliente);
    if (bloqueo.bloqueado) {
      return NextResponse.json(
        { error: 'Demasiados intentos fallidos. Intenta nuevamente más tarde.' },
        { status: 429, headers: { 'Retry-After': String(bloqueo.retryAfter) } }
      );
    }

    const body = await request.json();
    const identificador = typeof body?.identificador === 'string' ? body.identificador : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!identificador || !password) {
      return NextResponse.json(
        { error: 'Debe ingresar su RUT o correo institucional y contraseña' },
        { status: 400 }
      );
    }

    const cleanId = identificador.trim().toLowerCase();
    const claveIdentificador = `login:id:${cleanId}`;

    // Segundo límite por cuenta: evita fuerza bruta distribuida desde muchas IP.
    const bloqueoCuenta = await verificarBloqueo(claveIdentificador);
    if (bloqueoCuenta.bloqueado) {
      return NextResponse.json(
        { error: 'Demasiados intentos fallidos. Intenta nuevamente más tarde.' },
        { status: 429, headers: { 'Retry-After': String(bloqueoCuenta.retryAfter) } }
      );
    }

    const supabase = getSupabaseInstitucionalAdmin();

    // Buscar por correo o por RUT
    let query = supabase.from('usuarios_institucion').select('*');
    if (cleanId.includes('@')) {
      query = query.eq('correo_institucional', cleanId);
    } else {
      query = query.eq('rut', cleanId.toUpperCase());
    }

    const { data: usuario, error } = await query.single();

    if (error || !usuario) {
      await Promise.all([registrarFallo(claveCliente), registrarFallo(claveIdentificador)]);
      return NextResponse.json({ error: MENSAJE_CREDENCIALES }, { status: 401 });
    }

    const passwordHash = usuario.password_hash as string;

    // Solo se aceptan hashes Argon2id. Nunca comparar texto plano.
    if (!passwordHash || !passwordHash.startsWith('$argon2')) {
      console.error(`[login] Hash no soportado para el usuario ${usuario.id}`);
      await Promise.all([registrarFallo(claveCliente), registrarFallo(claveIdentificador)]);
      return NextResponse.json({ error: MENSAJE_CREDENCIALES }, { status: 401 });
    }

    let passwordValida = false;
    try {
      passwordValida = await argon2.verify(passwordHash, password);
    } catch (err) {
      console.error('[login] Error al verificar el hash Argon2:', err);
      passwordValida = false;
    }

    if (!passwordValida) {
      await Promise.all([registrarFallo(claveCliente), registrarFallo(claveIdentificador)]);
      return NextResponse.json({ error: MENSAJE_CREDENCIALES }, { status: 401 });
    }

    await Promise.all([limpiarIntentos(claveCliente), limpiarIntentos(claveIdentificador)]);

    if (!usuario.estado_activo) {
      return NextResponse.json(
        { error: 'El usuario se encuentra inactivo en el sistema institucional' },
        { status: 403 }
      );
    }

    // Rehash transparente si los parámetros de Argon2 quedaron obsoletos.
    if (argon2.needsRehash(passwordHash)) {
      try {
        const { error: errorActualizacion } = await supabase
          .from('usuarios_institucion')
          .update({ password_hash: await argon2.hash(password) })
          .eq('id', usuario.id);
        if (errorActualizacion) throw errorActualizacion;
      } catch (err) {
        console.error('[login] No se pudo actualizar el hash Argon2:', err);
      }
    }

    // Sesión firmada: el cliente no puede alterar RUT ni rol.
    const token = await signSession({ rut: usuario.rut, rol: usuario.rol as Rol });

    const { password_hash, ...perfilSeguro } = usuario;
    const response = NextResponse.json({
      usuario: perfilSeguro,
      mensaje: 'Autenticación institucional exitosa',
    });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());

    // Limpiar cookies antiguas no firmadas, si existían.
    for (const nombre of LEGACY_SESSION_COOKIES) {
      response.cookies.set(nombre, '', { path: '/', maxAge: 0 });
    }

    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err: unknown) {
    console.error('[login] Error interno:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
