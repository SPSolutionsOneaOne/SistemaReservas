// ============================================================
// Horarios de bloque y hora actual "de pared" (America/Santiago)
// Se compara siempre en reloj de pared: ambas partes (fecha+bloque
// y el "ahora") se expresan en hora local de Santiago, por lo que
// el desfase UTC/DST no afecta a las comparaciones.
// ============================================================

import { BLOQUES_HORARIOS, MINUTOS_GRACIA_CHECKIN } from '@/types/database';

export const ZONA_HORARIA = 'America/Santiago';

export interface FechaHoraPared {
  /** 'YYYY-MM-DD' en hora local de Santiago */
  fecha: string;
  /** Minutos desde las 00:00 en Santiago */
  minutos: number;
}

/**
 * Hora actual expresada en reloj de pared de America/Santiago.
 */
export function ahoraSantiago(ahora = new Date()): FechaHoraPared {
  const partes = new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ahora);

  const valor = (tipo: string): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';

  // Algunos runtimes entregan '24' a medianoche con h23; se normaliza.
  const hora = Number(valor('hour')) % 24;
  const fecha = `${valor('year')}-${valor('month')}-${valor('day')}`;
  return { fecha, minutos: hora * 60 + Number(valor('minute')) };
}

function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/** Minutos desde medianoche del inicio del bloque (0-26). */
export function inicioBloqueMinutos(bloque: number): number {
  const info = BLOQUES_HORARIOS[bloque];
  if (!info) throw new Error(`Bloque horario inválido: ${bloque}`);
  return minutosDeHora(info.inicio);
}

/**
 * Ventana de check-in: desde (inicio - gracia) hasta (inicio + gracia),
 * solo el día de la reserva. Fuera de ella el check-in se rechaza.
 */
export function checkinPermitido(
  fecha: string,
  bloque: number,
  pared: FechaHoraPared = ahoraSantiago()
): boolean {
  if (fecha !== pared.fecha) return false;
  const inicio = inicioBloqueMinutos(bloque);
  return (
    pared.minutos >= inicio - MINUTOS_GRACIA_CHECKIN &&
    pared.minutos <= inicio + MINUTOS_GRACIA_CHECKIN
  );
}

/**
 * ¿Ya venció la gracia tras el inicio del bloque? (para el barrido
 * automático de inasistencias).
 */
export function vencidaGracia(
  fecha: string,
  bloque: number,
  pared: FechaHoraPared = ahoraSantiago()
): boolean {
  if (fecha < pared.fecha) return true;
  if (fecha > pared.fecha) return false;
  return pared.minutos >= inicioBloqueMinutos(bloque) + MINUTOS_GRACIA_CHECKIN;
}

/** Inicio de la franja de uso: 08:30 (todos los días con servicio). */
export const FRANJA_USO_INICIO_MINUTOS = 8 * 60 + 30;

/** Fin de la franja: lunes a viernes 22:00, sábado 14:00. */
export const FRANJA_USO_FIN_SEMANA_MINUTOS = 22 * 60;
export const FRANJA_USO_FIN_SABADO_MINUTOS = 14 * 60;

/**
 * Franja de uso (horario del cliente): lunes a viernes 08:30–22:00,
 * sábado 08:30–14:00. Domingos sin servicio (igual que en reservas).
 */
export function enFranjaDeUso(pared: FechaHoraPared = ahoraSantiago()): boolean {
  const diaSemana = new Date(`${pared.fecha}T12:00:00Z`).getUTCDay();
  if (diaSemana === 0) return false;
  const fin =
    diaSemana === 6 ? FRANJA_USO_FIN_SABADO_MINUTOS : FRANJA_USO_FIN_SEMANA_MINUTOS;
  return pared.minutos >= FRANJA_USO_INICIO_MINUTOS && pared.minutos < fin;
}
