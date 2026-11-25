// ============================================================
// NotificadorEmailObserver — despacho real con adaptador SMTP/Resend
// RF-PER-08: confirmación por correo con adjunto .ics
// Prioridad: SMTP_* (Gmail) > RESEND_API_TOKEN > modo pendiente
// Nunca finge un envío: cada intento se registra en DB-Reservas.
// ============================================================

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { GeneradorICS, EventoReservaPayload, ReservaObserver } from './GeneradorICS';

type EstadoNotificacion = 'pendiente' | 'enviado' | 'fallido';
type Proveedor = 'smtp' | 'resend' | 'ninguno';

let transporterCache: Transporter | null = null;

function configuracionSmtp(): { host: string; port: number; user: string; pass: string; from: string } | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    user,
    pass,
    from: process.env.SMTP_FROM || user,
  };
}

function transporter(): Transporter {
  if (!transporterCache) {
    const cfg = configuracionSmtp()!;
    transporterCache = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,       // Gmail 465 → TLS directo; 587 → STARTTLS
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return transporterCache;
}

function clienteResend(): Resend | null {
  const token = process.env.RESEND_API_TOKEN;
  return token ? new Resend(token) : null;
}

function proveedorActivo(): Proveedor {
  if (configuracionSmtp()) return 'smtp';
  if (clienteResend()) return 'resend';
  return 'ninguno';
}

async function registrar(
  payload: EventoReservaPayload,
  destinatario: string,
  estado: EstadoNotificacion,
  proveedor: Proveedor,
  error?: string
) {
  const supabase = getSupabaseReservasAdmin();
  const { error: err } = await supabase.from('notificaciones_correo').insert({
    id_reserva: payload.reserva.id_reserva,
    codigo_reserva: payload.reserva.codigo_reserva,
    destinatario,
    asunto: `Confirmación de reserva ${payload.reserva.codigo_reserva}`,
    estado,
    proveedor,
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

    const proveedor = proveedorActivo();

    if (proveedor === 'ninguno') {
      for (const destinatario of destinatarios) {
        await registrar(payload, destinatario, 'pendiente', 'ninguno', 'Sin SMTP_HOST/SMTP_PASS ni RESEND_API_TOKEN');
      }
      console.warn('[NotificacionCorreo] Sin proveedor configurado: envío pendiente registrado en BD');
      return;
    }

    await Promise.all(destinatarios.map(async (destinatario) => {
      try {
        if (proveedor === 'smtp') {
          const cfg = configuracionSmtp()!;
          await transporter().sendMail({
            from: cfg.from,
            to: destinatario,
            subject: asunto,
            text: texto,
            attachments: [{ filename: `reserva-${payload.reserva.codigo_reserva}.ics`, content: ics }],
          });
        } else {
          const resend = clienteResend()!;
          const { error } = await resend.emails.send({
            from: process.env.RESEND_FROM || 'Reserva de Salas <onboarding@resend.dev>',
            to: [destinatario],
            subject: asunto,
            text: texto,
            attachments: [{ filename: `reserva-${payload.reserva.codigo_reserva}.ics`, content: ics }],
          });
          if (error) throw new Error(error.message);
        }
        await registrar(payload, destinatario, 'enviado', proveedor);
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : String(err);
        await registrar(payload, destinatario, 'fallido', proveedor, mensaje.slice(0, 500));
        console.error('[NotificacionCorreo] Fallo al enviar a', destinatario, ':', mensaje);
      }
    }));
  }
}
