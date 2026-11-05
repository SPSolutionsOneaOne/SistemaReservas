import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservas } from '@/lib/supabaseReservas';
import {
  crearReservaConValidacion,
  editarReservaConValidacion,
} from '@/controllers/reservasController';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id_sala = searchParams.get('id_sala');
    const usuario_rut = searchParams.get('usuario_rut');
    const fecha = searchParams.get('fecha');

    const supabase = getSupabaseReservas();
    let query = supabase.from('reservas').select('*');

    if (id_sala) query = query.eq('id_sala', id_sala);
    if (usuario_rut) query = query.eq('usuario_rut', usuario_rut);
    if (fecha) query = query.eq('fecha', fecha);

    const { data, error } = await query.order('fecha', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno al consultar reservas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      id_sala,
      usuario_rut,
      fecha,
      bloque_horario,
      cantidad_asistentes,
      proposito,
      asistentes,
      encargado_rut,
    } = body;

    if (
      !id_sala ||
      !usuario_rut ||
      !fecha ||
      bloque_horario === undefined ||
      !cantidad_asistentes ||
      !proposito
    ) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios para registrar la reserva' },
        { status: 400 }
      );
    }

    const resultado = await crearReservaConValidacion(
      {
        id_sala,
        usuario_rut,
        fecha,
        bloque_horario: Number(bloque_horario),
        cantidad_asistentes: Number(cantidad_asistentes),
        proposito,
        estado: 'confirmada',
      },
      Array.isArray(asistentes) ? asistentes : [],
      encargado_rut
    );

    if (!resultado.exito) {
      return NextResponse.json(
        { error: resultado.error },
        { status: resultado.httpCode || 400 }
      );
    }

    return NextResponse.json(resultado.reserva, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al crear reserva';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id_reserva, fecha, bloque_horario, cantidad_asistentes, proposito } = body;

    if (!id_reserva) {
      return NextResponse.json({ error: 'id_reserva es requerido' }, { status: 400 });
    }

    const resultado = await editarReservaConValidacion(id_reserva, {
      fecha,
      bloque_horario: bloque_horario !== undefined ? Number(bloque_horario) : undefined,
      cantidad_asistentes: cantidad_asistentes !== undefined ? Number(cantidad_asistentes) : undefined,
      proposito,
    });

    if (!resultado.exito) {
      return NextResponse.json(
        { error: resultado.error },
        { status: resultado.httpCode || 400 }
      );
    }

    return NextResponse.json(resultado.reserva);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al editar reserva';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
