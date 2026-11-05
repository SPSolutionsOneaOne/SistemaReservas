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

/**
 * Valida que el bloque horario esté dentro del rango válido (0-13).
 */
export function validarBloqueHorario(bloque: number): boolean {
  return Number.isInteger(bloque) && bloque >= 0 && bloque <= 13;
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
