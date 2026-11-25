// Generador de contenido iCalendar (RFC 5545) — sin dependencias de observers.
import { Reserva, Sala, BLOQUES_HORARIOS } from '@/types/database';

export interface EventoReservaPayload {
  reserva: Reserva;
  sala: Sala;
  correoTitular: string;
  nombreTitular: string;
  correosAsistentes: string[];
}

/** Interfaz Observer */
export interface ReservaObserver {
  actualizar(payload: EventoReservaPayload): Promise<void>;
}

/** Interfaz Sujeto Observable */
export interface ReservaSubject {
  suscribir(observer: ReservaObserver): void;
  desuscribir(observer: ReservaObserver): void;
  notificar(payload: EventoReservaPayload): Promise<void>;
}

export class GeneradorICS {
  static generarContenidoICS(payload: EventoReservaPayload): string {
    const { reserva, sala, correoTitular, nombreTitular } = payload;
    const bloque = BLOQUES_HORARIOS[reserva.bloque_horario];
    const fechaLimpia = reserva.fecha.replace(/-/g, '');
    const [hInicio, mInicio] = bloque.inicio.split(':');
    const [hFin, mFin] = bloque.fin.split(':');
    const dtStart = `${fechaLimpia}T${hInicio}${mInicio}00`;
    const dtEnd = `${fechaLimpia}T${hFin}${mFin}00`;
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sistema de Reservas//Sistema v1.0//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${reserva.codigo_reserva}-${reserva.id_reserva}@institucion.cl`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:Reserva Sala ${sala.nombre_descriptivo} (${sala.id_sala})`,
      `DESCRIPTION:Reserva código ${reserva.codigo_reserva}. Propósito: ${reserva.proposito}. Check-in obligatorio con QR.`,
      `LOCATION:Piso ${sala.piso} - ${sala.nombre_descriptivo} [${sala.id_sala}]`,
      `ORGANIZER;CN="${nombreTitular}":mailto:${correoTitular}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Recordatorio de reserva de sala institucional',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}
