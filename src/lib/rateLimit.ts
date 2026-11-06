// ============================================================
// Rate limiting del login — almacén compartido
// ------------------------------------------------------------
// Usa la tabla public.intentos_login de DB-Reservas mediante
// funciones RPC atómicas. Así el contador se comparte entre todas
// las instancias (Vercel, contenedores, múltiples réplicas) y no se
// reinicia con cada arranque o despliegue.
//
// Las claves se guardan como hash SHA-256: la base nunca almacena
// el correo ni el RUT en texto claro.
//
// Si el almacén compartido falla (red, RPC inexistente, SQL sin
// ejecutar), el limitador cae a memoria local por instancia y deja
// constancia en el log. Ese fallback mantiene la disponibilidad del
// login, pero no reemplaza al almacén compartido.
// ============================================================

import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';

export const MAX_INTENTOS = 5;
export const VENTANA_SEGUNDOS = 15 * 60; // 15 minutos
export const BLOQUEO_SEGUNDOS = 15 * 60; // 15 minutos

export interface ResultadoBloqueo {
  bloqueado: boolean;
  retryAfter: number;
}

type FilaResultado = { bloqueado: boolean; retry_after: number };

// ---- Fallback en memoria (solo si el almacén compartido falla) ----

interface RegistroMemoria {
  intentos: number;
  primeraVez: number;
  bloqueadoHasta: number;
}

const VENTANA_MS = VENTANA_SEGUNDOS * 1000;
const BLOQUEO_MS = BLOQUEO_SEGUNDOS * 1000;
const MAX_REGISTROS = 5000;

const registrosMemoria = new Map<string, RegistroMemoria>();

function limpiarMemoria(ahora: number): void {
  if (registrosMemoria.size < MAX_REGISTROS) return;
  registrosMemoria.forEach((value, key) => {
    const expirado =
      ahora - value.primeraVez > VENTANA_MS && value.bloqueadoHasta <= ahora;
    if (expirado) registrosMemoria.delete(key);
  });
}

function verificarMemoria(key: string): ResultadoBloqueo {
  const ahora = Date.now();
  limpiarMemoria(ahora);

  const registro = registrosMemoria.get(key);
  if (!registro) return { bloqueado: false, retryAfter: 0 };

  if (registro.bloqueadoHasta > ahora) {
    return {
      bloqueado: true,
      retryAfter: Math.ceil((registro.bloqueadoHasta - ahora) / 1000),
    };
  }

  if (ahora - registro.primeraVez > VENTANA_MS) {
    registrosMemoria.delete(key);
  }

  return { bloqueado: false, retryAfter: 0 };
}

function registrarMemoria(key: string): void {
  const ahora = Date.now();
  const registro = registrosMemoria.get(key);

  if (!registro || ahora - registro.primeraVez > VENTANA_MS) {
    registrosMemoria.set(key, { intentos: 1, primeraVez: ahora, bloqueadoHasta: 0 });
    return;
  }

  registro.intentos += 1;

  if (registro.intentos >= MAX_INTENTOS) {
    registro.bloqueadoHasta = ahora + BLOQUEO_MS;
  }
}

// ---- Utilidades ----

/** Evita almacenar correo/RUT en claro en la base. */
async function hashearClave(clave: string): Promise<string> {
  const bytes = new TextEncoder().encode(clave);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizarResultado(data: unknown): ResultadoBloqueo | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== 'object') return null;

  const candidato = fila as Partial<FilaResultado>;
  if (typeof candidato.bloqueado !== 'boolean') return null;

  const retryAfter = Number(candidato.retry_after ?? 0);
  return {
    bloqueado: candidato.bloqueado,
    retryAfter: Number.isFinite(retryAfter) ? Math.max(0, Math.ceil(retryAfter)) : 0,
  };
}

// ---- API pública ----

/**
 * Consulta si una clave (IP o cuenta) está bloqueada.
 * Usa la base compartida y cae a memoria si no está disponible.
 */
export async function verificarBloqueo(key: string): Promise<ResultadoBloqueo> {
  try {
    const clave = await hashearClave(key);
    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase.rpc('login_verificar_bloqueo', {
      p_clave: clave,
    });

    if (error) throw error;

    const resultado = normalizarResultado(data);
    if (!resultado) throw new Error('Respuesta inválida de login_verificar_bloqueo');
    return resultado;
  } catch (err) {
    console.error(
      '[rateLimit] Almacén compartido no disponible; usando memoria local:',
      err
    );
    return verificarMemoria(key);
  }
}

/**
 * Registra un intento fallido en la base compartida y devuelve si la
 * clave quedó bloqueada. Es atómico: soporta intentos concurrentes.
 */
export async function registrarFallo(key: string): Promise<ResultadoBloqueo> {
  try {
    const clave = await hashearClave(key);
    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase.rpc('login_registrar_fallo', {
      p_clave: clave,
      p_max_fallos: MAX_INTENTOS,
      p_ventana_segundos: VENTANA_SEGUNDOS,
      p_bloqueo_segundos: BLOQUEO_SEGUNDOS,
    });

    if (error) throw error;

    const resultado = normalizarResultado(data);
    if (!resultado) throw new Error('Respuesta inválida de login_registrar_fallo');
    return resultado;
  } catch (err) {
    console.error(
      '[rateLimit] Almacén compartido no disponible; usando memoria local:',
      err
    );
    registrarMemoria(key);
    return verificarMemoria(key);
  }
}

/** Limpia el contador tras un login exitoso. */
export async function limpiarIntentos(key: string): Promise<void> {
  registrosMemoria.delete(key);

  try {
    const clave = await hashearClave(key);
    const supabase = getSupabaseReservasAdmin();
    const { error } = await supabase.rpc('login_limpiar_intentos', {
      p_clave: clave,
    });

    if (error) throw error;
  } catch (err) {
    console.error('[rateLimit] No se pudo limpiar el contador compartido:', err);
  }
}

/** Obtiene una clave estable por cliente (IP) para el limitador. */
export function obtenerClaveCliente(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim();
  return ip || 'local';
}
