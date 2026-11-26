// ============================================================
// VALIDADORES DE DOMINIO
// Funciones puras de validación según reglas del diccionario de datos
// ============================================================

import { DOMINIOS_INSTITUCIONALES } from '@/types/database';

/**
 * Valida formato de RUT chileno: '12.345.678-K'
 * Acepta formatos: XX.XXX.XXX-X (con puntos y guión)
 */
export function validarFormatoRut(rut: string): boolean {
  const regex = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;
  return regex.test(rut);
}

/**
 * Valida el dígito verificador de un RUT chileno.
 * @param rut — Formato '12.345.678-5' o '12345678-5'
 */
export function validarRutChileno(rut: string): boolean {
  // Limpiar formato
  const limpio = rut.replace(/\./g, '').replace(/-/g, '');
  if (limpio.length < 2) return false;

  const cuerpo = limpio.slice(0, -1);
  const digitoVerificador = limpio.slice(-1).toUpperCase();

  // Calcular dígito verificador con módulo 11
  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  let dvCalculado: string;

  if (resto === 11) dvCalculado = '0';
  else if (resto === 10) dvCalculado = 'K';
  else dvCalculado = resto.toString();

  return digitoVerificador === dvCalculado;
}

/**
 * Valida que el correo pertenezca al dominio institucional (RN04).
 * Dominio: @institucion.cl
 */
export function validarCorreoInstitucional(correo: string): boolean {
  const correoLower = correo.toLowerCase().trim();
  return DOMINIOS_INSTITUCIONALES.some((dominio) =>
    correoLower.endsWith(dominio)
  );
}

/**
 * Sanea el propósito de la reserva (defensa en profundidad contra XSS):
 * elimina etiquetas HTML y normalize espacios. React ya escapa en render,
 * pero el servidor no almacena markup ejecutable (CP-FA2-011).
 */
export function sanearProposito(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/** Bloque máximo válido: lunes a viernes 08:30–22:00 (18 bloques de 45 min). */
export const BLOQUE_MAXIMO = 17;

/** Último bloque de sábado (08:30–13:45). */
export const BLOQUE_MAXIMO_SABADO = 6;

/**
 * Valida que el bloque horario esté dentro del rango válido (0-17).
 */
export function validarBloqueHorario(bloque: number): boolean {
  return Number.isInteger(bloque) && bloque >= 0 && bloque <= BLOQUE_MAXIMO;
}

/**
 * Día de semana de una fecha 'YYYY-MM-DD' (0 domingo … 6 sábado).
 */
export function diaSemanaDeFecha(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/**
 * ¿El bloque existe en ese día?
 * - Domingo: sin servicio (ningún bloque).
 * - Sábado: solo bloques 0-6 (08:30–13:45).
 * - Lunes a viernes: bloques 0-17 (08:30–22:00).
 */
export function validarBloqueParaFecha(fecha: string, bloque: number): boolean {
  if (!esFechaValida(fecha)) return false;
  const dia = diaSemanaDeFecha(fecha);
  if (dia === 0) return false;
  if (dia === 6) return Number.isInteger(bloque) && bloque >= 0 && bloque <= BLOQUE_MAXIMO_SABADO;
  return Number.isInteger(bloque) && bloque >= 0 && bloque <= BLOQUE_MAXIMO;
}

/**
 * Valida que la cantidad de asistentes no exceda el aforo de la sala.
 * @returns true si la cantidad es válida (<= aforo y > 0)
 */
export function validarAforo(cantidadAsistentes: number, aforoSala: number): boolean {
  return cantidadAsistentes > 0 && cantidadAsistentes <= aforoSala;
}

/**
 * Valida que el piso esté en el rango permitido (1-9).
 */
export function validarPiso(piso: number): boolean {
  return Number.isInteger(piso) && piso >= 1 && piso <= 9;
}

/**
 * Genera un código de reserva con prefijo 'RES-' y número secuencial.
 * @param secuencia — Número secuencial actual
 */
export function generarCodigoReserva(secuencia: number): string {
  return `RES-${secuencia.toString().padStart(4, '0')}`;
}

/**
 * Valida que la fecha ('YYYY-MM-DD') sea una fecha real del calendario.
 */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const date = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    date.getUTCFullYear() === anio &&
    date.getUTCMonth() === mes - 1 &&
    date.getUTCDate() === dia
  );
}

/** Fecha actual en reloj de pared America/Santiago, formato YYYY-MM-DD. */
function hoySantiagoIso(): string {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const v = (t: string): string => partes.find((p) => p.type === t)?.value ?? '';
  return `${v('year')}-${v('month')}-${v('day')}`;
}

/**
 * Valida que la fecha ('YYYY-MM-DD') esté en la ventana móvil de reserva:
 * desde hoy (America/Santiago) hasta un mes después del día de hoy.
 * Ejemplos: 25-nov → 25-dic · 30-nov → 30-dic · 31-dic → 31-ene.
 * No se agenda en el pasado ni más allá de esa ventana.
 */
export function validarFechaEnVentana(fecha: string): boolean {
  if (!esFechaValida(fecha)) return false;

  const hoyLocal = hoySantiagoIso();
  if (fecha < hoyLocal) return false;

  const [anio, mes, dia] = hoyLocal.split('-').map(Number);
  const limite = new Date(Date.UTC(anio, mes - 1, dia));
  limite.setUTCMonth(limite.getUTCMonth() + 1);
  const max = [
    limite.getUTCFullYear(),
    String(limite.getUTCMonth() + 1).padStart(2, '0'),
    String(limite.getUTCDate()).padStart(2, '0'),
  ].join('-');
  return fecha <= max;
}

/** @deprecated Alias conservado por compatibilidad; usar validarFechaEnVentana. */
export const validarFechaMesEnCurso = validarFechaEnVentana;
