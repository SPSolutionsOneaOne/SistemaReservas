import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservas } from '@/lib/supabaseReservas';
import { resetearAusencias } from '@/controllers/reservasController';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id_reserva, codigo_reserva } = body;

    if (!id_reserva && !codigo_reserva) {
      return NextResponse.json(
        { error: 'Debe proporcionar id_reserva o codigo_reserva para realizar check-in' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseReservas();
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

    if (reserva.estado === 'cancelada') {
      return NextResponse.json({ error: 'La reserva se encuentra cancelada' }, { status: 400 });
    }

    if (reserva.asistencia_registrada_en) {
      return NextResponse.json(
        { error: `Asistencia ya registrada previamente el ${new Date(reserva.asistencia_registrada_en).toLocaleString('es-CL')}` },
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
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }

    // Regla de Negocio: si asiste a la sala, se resetean las ausencias acumuladas
    await resetearAusencias(reserva.usuario_rut);

    return NextResponse.json({
      mensaje: 'Check-in realizado exitosamente',
      reserva: actualizada,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar check-in';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
