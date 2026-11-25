// ============================================================
// NotificadorEmailObserver — Resend + evidencia en DB-Reservas
// RF-PER-08: confirmación por correo con adjunto .ics
// Si no hay RESEND_API_TOKEN, NO finge envío: registra 'pendiente'.
// ============================================================

import { Resend } from 'resend';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { GeneradorICS, EventoReservaPayload, ReservaObserver } from './GeneradorICS';

type EstadoNotificacion = 'pendiente' | 'enviado' | 'fallido';

function clienteResend(): Resend | null {
  const token = process.env.RESEND_API_TOKEN;
  return token ? new Resend(token) : null;
}

function remitente(): string {
  return process.env.RESEND_FROM || 'Reserva de Salas <onboarding@resend.dev>';
}

async function registrar(payload: EventoReservaPayload, destinatario: string, estado: EstadoNotificacion, error?: string) {
  const supabase = getSupabaseReservasAdmin();
  const { error: err } = await supabase.from('notificaciones_correo').insert({
    id_reserva: payload.reserva.id_reserva,
    codigo_reserva: payload.reserva.codigo_reserva,
    destinatario,
    asunto: `Confirmación de reserva ${payload.reserva.codigo_reserva}`,
    estado,
    proveedor: 'resend',
    error_mensaje: error ?? null,
  });
  if (err) console.error('[NotificacionCorreo] No se pudo registrar evidencia:', err.message);
}

export class NotificadorEmailObserver implements ReservaObserver {
  async actualizar(payload: EventoReservaPayload): Promise<void> {
    const destinatarios = [payload.correoTitular, ...payload.correosAsistentes].filter(Boolean);
    const ics = GeneradorICS.generarContenidoICS(payload);
    const asunto = `Confirmación de reserva ${payload.reserva.codigo_reserva}`;
    const texto = `Estimado/a ${payload.nombreTitular}:\n\nSu reserva ha sido confirmada.\n\n` +
      `Sala: ${payload.sala.nombre_descriptivo} (${payload.sala.id_sala})\n` +
      `Fecha: ${payload.reserva.fecha}\n` +
      `Código: ${payload.reserva.codigo_reserva}\n\n` +
      `Adjunto encontrará el evento .ics para agregarlo a su calendario (recordatorio 15 min antes).\n` +
      `Recuerde realizar el check-in con QR dentro de los 10 minutos posteriores al inicio del bloque.\n`;

    const resend = clienteResend();
    if (!resend) {
      for (const destinatario of destinatarios) await registrar(payload, destinatario, 'pendiente', 'RESEND_API_TOKEN no configurado');
      console.warn('[NotificacionCorreo] Sin RESEND_API_TOKEN: envío pendiente registrado en BD');
      return;
    }

    await Promise.all(destinatarios.map(async (destinatario) => {
      try {
        const { error } = await resend.emails.send({
          from: remitente(),
          to: [destinatario],
          subject: asunto,
          text: texto,
          attachments: [{ filename: `reserva-${payload.reserva.codigo_reserva}.ics`, content: ics }],
        });
        if (error) throw new Error(error.message);
        await registrar(payload, destinatario, 'enviado');
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        await registrar(payload, destinatario, 'fallido', mensaje.slice(0, 500));
        console.error('[NotificacionCorreo] Fallo al enviar a', destinatario, ':', mensaje);
      }
    }));
  }
}
