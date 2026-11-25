// ============================================================
// Patrón Observer: gestor de notificaciones de reserva
// Compone el generador .ics y el despacho real de correo.
// ============================================================

import { NotificadorEmailObserver } from './NotificadorEmailObserver';
import { GeneradorICS, EventoReservaPayload, ReservaObserver, ReservaSubject } from './GeneradorICS';

export { GeneradorICS } from './GeneradorICS';
export type { EventoReservaPayload, ReservaObserver, ReservaSubject } from './GeneradorICS';
export { NotificadorEmailObserver } from './NotificadorEmailObserver';

/** Observer Concreto 1: genera y registra el archivo .ics */
export class NotificadorICSObserver implements ReservaObserver {
  async actualizar(payload: EventoReservaPayload): Promise<void> {
    const icsContent = GeneradorICS.generarContenidoICS(payload);
    console.log(`[Observer - ICS] Generado .ics para reserva ${payload.reserva.codigo_reserva} (${icsContent.length} bytes)`);
  }
}

/** Sujeto Concreto */
export class NotificadorReservasService implements ReservaSubject {
  private observers: ReservaObserver[] = [];

  constructor() {
    this.suscribir(new NotificadorICSObserver());
    this.suscribir(new NotificadorEmailObserver());
  }

  suscribir(observer: ReservaObserver): void {
    if (!this.observers.includes(observer)) this.observers.push(observer);
  }

  desuscribir(observer: ReservaObserver): void {
    this.observers = this.observers.filter((obs) => obs !== observer);
  }

  async notificar(payload: EventoReservaPayload): Promise<void> {
    await Promise.all(this.observers.map((obs) => obs.actualizar(payload)));
  }
}

export const notificadorGlobal = new NotificadorReservasService();
