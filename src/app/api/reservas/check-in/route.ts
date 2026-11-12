import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { resetearAusencias } from '@/controllers/reservasController';
import { authorize, ROLES_STAFF } from '@/lib/authz';
import { checkinPermitido } from '@/lib/horarios';

/**
 * Acepta 'RESERVA-SALAS|TOKEN' (contenido del QR) o el token suelto.
 * Devuelve null si el formato no es válido.
 */
function extraerToken(qr: string): string | null {
  const limpio = qr.trim().toUpperCase();
  const token = limpio.includes('|')
    ? limpio.split('|').pop()?.trim() ?? ''
    : limpio;
  return /^[A-Z0-9]{6,20}$/.test(token) ? token : null;
}

export async function POST(request: NextRequest) {
  try {
    // Cualquier usuario autenticado puede hacer check-in, pero solo de sus
    // propias reservas. El personal administrativo puede hacerlo por terceros.
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id_reserva, codigo_reserva, qr_token, codigo_manual } = body;

    // El escaneo/ingreso debe ir siempre acompañado del QR o código
    // manual de la sala (LIMPIEZA DEL VALIDADOR: ya no hay códigos de prueba).
    const tokenEntrada = typeof qr_token === 'string' ? extraerToken(qr_token) : null;
    const manualEntrada =
      typeof codigo_manual === 'string' ? codigo_manual.trim() : null;

    if (!tokenEntrada && !manualEntrada) {
      return NextResponse.json(
        { error: 'Debe escanear el QR de la sala o ingresar su código manual de 6 dígitos' },
        { status: 400 }
      );
    }

    if (!id_reserva && !codigo_reserva) {
      return NextResponse.json(
        { error: 'Debe proporcionar id_reserva o codigo_reserva para realizar check-in' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseReservasAdmin();

    // Resolver la sala real desde el QR o el código manual.
    const querySala = supabase
      .from('salas')
      .select('id_sala, nombre_descriptivo, qr_token, codigo_manual');
    const { data: salaValidada, error: errSalaVal } = tokenEntrada
      ? await querySala.eq('qr_token', tokenEntrada).maybeSingle()
      : await querySala.eq('codigo_manual', manualEntrada as string).maybeSingle();

    if (errSalaVal || !salaValidada) {
      return NextResponse.json(
        { error: 'Código QR o código manual no válido: no corresponde a una sala del sistema' },
        { status: 404 }
      );
    }

    let query = supabase.from('reservas').select('*');

    if (id_reserva) {
      query = query.eq('id_reserva', id_reserva);
    } else {
      query = query.eq('codigo_reserva', codigo_reserva);
    }

    const { data: reserva, error: errBusqueda } = await query.single();

    if (errBusqueda || !reserva) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    // El QR/código manual debe corresponder a la MISMA sala de la reserva.
    if (salaValidada.id_sala !== reserva.id_sala) {
      return NextResponse.json(
        {
          error: `El código corresponde a la sala ${salaValidada.id_sala} (${salaValidada.nombre_descriptivo}), no a la de esta reserva (${reserva.id_sala}).`,
        },
        { status: 409 }
      );
    }

    // El titular solo puede registrar su propia asistencia.
    // El personal administrativo puede registrar la asistencia de cualquier reserva.
    const esStaff = ROLES_STAFF.includes(auth.session.rol);
    if (!esStaff && reserva.usuario_rut !== auth.session.rut) {
      return NextResponse.json(
        { error: 'No autorizado para registrar la asistencia de esta reserva' },
        { status: 403 }
      );
    }

    if (reserva.estado === 'cancelada') {
      return NextResponse.json({ error: 'La reserva se encuentra cancelada' }, { status: 400 });
    }

    if (reserva.asistencia_registrada_en) {
      return NextResponse.json(
        { error: `Asistencia ya registrada previamente el ${new Date(reserva.asistencia_registrada_en).toLocaleString('es-CL')}` },
        { status: 400 }
      );
    }

    // Ventana estricta: desde 10 min antes hasta 10 min después del inicio
    // del bloque. Fuera de ella rige el motor de inasistencias.
    if (!checkinPermitido(reserva.fecha, reserva.bloque_horario)) {
      return NextResponse.json(
        {
          error:
            'Fuera de horario: el check-in solo está disponible desde 10 minutos antes hasta 10 minutos después del inicio del bloque.',
        },
        { status: 400 }
      );
    }

    const timestampNow = new Date().toISOString();

    const { data: actualizada, error: errUpdate } = await supabase
      .from('reservas')
      .update({
        asistencia_registrada_en: timestampNow,
        estado: 'completada',
      })
      .eq('id_reserva', reserva.id_reserva)
      .select()
      .single();

    if (errUpdate) {
      console.error('[check-in] Error al actualizar la reserva:', errUpdate);
      return NextResponse.json({ error: 'Error interno al registrar el check-in' }, { status: 500 });
    }

    // Regla de Negocio: si asiste a la sala, se resetean las ausencias acumuladas
    await resetearAusencias(reserva.usuario_rut);

    return NextResponse.json({
      mensaje: 'Check-in realizado exitosamente',
      reserva: actualizada,
    });
  } catch (err: unknown) {
    console.error('[check-in] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al registrar el check-in' }, { status: 500 });
  }
}
