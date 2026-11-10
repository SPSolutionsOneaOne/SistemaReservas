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
 * Valida que el correo pertenezca a un dominio institucional válido (RN04).
 * Dominios: @institucion.cl, @inacapmail.cl
 */
export function validarCorreoInstitucional(correo: string): boolean {
  const correoLower = correo.toLowerCase().trim();
  return DOMINIOS_INSTITUCIONALES.some((dominio) =>
    correoLower.endsWith(dominio)
  );
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

/**
 * Valida que la fecha ('YYYY-MM-DD') sea hoy o dentro del mes en curso.
 * Regla del sistema: no se agenda más allá del mes presente.
 * Tolera ±1 día entre la hora del servidor (UTC) y la hora local del usuario
 * para no rechazar fechas válidas en los bordes del mes.
 */
export function validarFechaMesEnCurso(fecha: string): boolean {
  if (!esFechaValida(fecha)) return false;

  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  const diaMinimo = new Date(ahora - MS_POR_DIA).toISOString().split('T')[0];
  const manana = new Date(ahora + MS_POR_DIA);
  const diaMaximo = new Date(
    Date.UTC(manana.getUTCFullYear(), manana.getUTCMonth() + 1, 0)
  )
    .toISOString()
    .split('T')[0];

  return fecha >= diaMinimo && fecha <= diaMaximo;
}
