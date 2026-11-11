// ============================================================
// Patrón Observer: NotificadorICS (RF-PER-08)
// Generación asíncrona de archivos .ics (iCalendar) y despacho
// de notificaciones para titulares y asistentes institucionales.
// ============================================================

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

/**
 * Generador de contenido estándar iCalendar (.ics - RFC 5545)
 */
export class GeneradorICS {
  static generarContenidoICS(payload: EventoReservaPayload): string {
    const { reserva, sala, correoTitular, nombreTitular } = payload;
    const bloque = BLOQUES_HORARIOS[reserva.bloque_horario];

    // Formatear fechas YYYYMMDDTHHmmss
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

/** Observer Concreto 1: Generador y Archivo .ics */
export class NotificadorICSObserver implements ReservaObserver {
  async actualizar(payload: EventoReservaPayload): Promise<void> {
    const icsContent = GeneradorICS.generarContenidoICS(payload);
    // En producción se almacena en Storage de Supabase o se adjunta al email
    console.log(`[Observer - ICS] Generado archivo de calendario para reserva ${payload.reserva.codigo_reserva}`);
    console.log(`[Observer - ICS Preview]\n${icsContent.slice(0, 200)}...`);
  }
}

/** Observer Concreto 2: Despacho Asíncrono de Correos */
export class NotificadorEmailObserver implements ReservaObserver {
  async actualizar(payload: EventoReservaPayload): Promise<void> {
    const destinatarios = [payload.correoTitular, ...payload.correosAsistentes];
    console.log(
      `[Observer - Email] Despachando notificación asíncrona a ${destinatarios.length} destinatarios:`,
      destinatarios
    );
  }
}

/** Sujeto Concreto (Gestor de Notificaciones) */
export class NotificadorReservasService implements ReservaSubject {
  private observers: ReservaObserver[] = [];

  constructor() {
    // Suscripción automática de observadores por defecto
    this.suscribir(new NotificadorICSObserver());
    this.suscribir(new NotificadorEmailObserver());
  }

  suscribir(observer: ReservaObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  desuscribir(observer: ReservaObserver): void {
    this.observers = this.observers.filter((obs) => obs !== observer);
  }

  async notificar(payload: EventoReservaPayload): Promise<void> {
    const promesas = this.observers.map((obs) => obs.actualizar(payload));
    await Promise.all(promesas);
  }
}

// Instancia singleton del notificador
export const notificadorGlobal = new NotificadorReservasService();
