// ============================================================
// Rate limiting en memoria para el login
// ------------------------------------------------------------
// Limita intentos fallidos por IP para frenar fuerza bruta.
// Nota: en un despliegue serverless/multi-instancia este almacén
// es local a cada instancia. Para producción distribuida se debe
// reemplazar por Redis/Upstash o una tabla en base de datos.
// ============================================================

interface Registro {
  intentos: number;
  primeraVez: number;
  bloqueadoHasta: number;
}

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos
const MAX_REGISTROS = 5000;

const registros = new Map<string, Registro>();

function limpiarExpirados(ahora: number): void {
  if (registros.size < MAX_REGISTROS) return;
  registros.forEach((value, key) => {
    const expirado =
      ahora - value.primeraVez > VENTANA_MS && value.bloqueadoHasta <= ahora;
    if (expirado) registros.delete(key);
  });
}

export function verificarBloqueo(key: string): { bloqueado: boolean; retryAfter: number } {
  const ahora = Date.now();
  limpiarExpirados(ahora);

  const registro = registros.get(key);
  if (!registro) return { bloqueado: false, retryAfter: 0 };

  if (registro.bloqueadoHasta > ahora) {
    return {
      bloqueado: true,
      retryAfter: Math.ceil((registro.bloqueadoHasta - ahora) / 1000),
    };
  }

  if (ahora - registro.primeraVez > VENTANA_MS) {
    registros.delete(key);
  }

  return { bloqueado: false, retryAfter: 0 };
}

export function registrarFallo(key: string): void {
  const ahora = Date.now();
  const registro = registros.get(key);

  if (!registro || ahora - registro.primeraVez > VENTANA_MS) {
    registros.set(key, { intentos: 1, primeraVez: ahora, bloqueadoHasta: 0 });
    return;
  }

  registro.intentos += 1;

  if (registro.intentos >= MAX_INTENTOS) {
    registro.bloqueadoHasta = ahora + BLOQUEO_MS;
  }
}

export function limpiarIntentos(key: string): void {
  registros.delete(key);
}

/** Obtiene una clave estable por cliente (IP) para el limitador. */
export function obtenerClaveCliente(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim();
  return ip || 'local';
}
