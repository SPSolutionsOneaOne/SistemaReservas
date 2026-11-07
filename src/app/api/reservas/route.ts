import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import {
  crearReservaConValidacion,
  editarReservaConValidacion,
  eliminarReservaConValidacion,
} from '@/controllers/reservasController';
import { authorize, ROLES_STAFF } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id_sala = searchParams.get('id_sala');
    const fecha = searchParams.get('fecha');

    // Los usuarios no administrativos solo pueden consultar sus propias reservas.
    const esStaff = ROLES_STAFF.includes(auth.session.rol);
    const usuario_rut = esStaff
      ? searchParams.get('usuario_rut')
      : auth.session.rut;

    const supabase = getSupabaseReservasAdmin();
    let query = supabase.from('reservas').select('*');

    if (id_sala) query = query.eq('id_sala', id_sala);
    if (usuario_rut) query = query.eq('usuario_rut', usuario_rut);
    if (fecha) query = query.eq('fecha', fecha);

    const { data, error } = await query.order('fecha', { ascending: false });

    if (error) {
      console.error('[reservas GET] Error al consultar reservas:', error);
      return NextResponse.json({ error: 'Error interno al consultar reservas' }, { status: 500 });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    console.error('[reservas GET] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al consultar reservas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      id_sala,
      usuario_rut,
      fecha,
      bloque_horario,
      cantidad_asistentes,
      proposito,
      asistentes,
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

    const esStaff = ROLES_STAFF.includes(auth.session.rol);
    const esTercero = usuario_rut !== auth.session.rut;

    // Un alumno/docente solo puede reservar para sí mismo.
    if (!esStaff && esTercero) {
      return NextResponse.json(
        { error: 'No autorizado para reservar a nombre de otro usuario' },
        { status: 403 }
      );
    }

    // El encargado se toma de la sesión, nunca del cuerpo de la petición.
    const encargado_rut = esStaff && esTercero ? auth.session.rut : undefined;

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
    console.error('[reservas POST] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al crear la reserva' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id_reserva, fecha, bloque_horario, cantidad_asistentes, proposito } = body;

    if (!id_reserva) {
      return NextResponse.json({ error: 'id_reserva es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();
    const { data: reserva } = await supabase
      .from('reservas')
      .select('usuario_rut')
      .eq('id_reserva', id_reserva)
      .single();

    if (!reserva) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    const esStaff = ROLES_STAFF.includes(auth.session.rol);
    if (!esStaff && reserva.usuario_rut !== auth.session.rut) {
      return NextResponse.json(
        { error: 'No autorizado para modificar esta reserva' },
        { status: 403 }
      );
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
    console.error('[reservas PATCH] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al editar la reserva' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id_reserva = searchParams.get('id_reserva');

    if (!id_reserva) {
      return NextResponse.json({ error: 'id_reserva es requerido' }, { status: 400 });
    }

    const esStaff = ROLES_STAFF.includes(auth.session.rol);

    const resultado = await eliminarReservaConValidacion(
      id_reserva,
      auth.session.rut,
      esStaff
    );

    if (!resultado.exito) {
      return NextResponse.json(
        { error: resultado.error },
        { status: resultado.httpCode || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      id_reserva: resultado.reserva?.id_reserva,
      codigo_reserva: resultado.reserva?.codigo_reserva,
    });
  } catch (err: unknown) {
    console.error('[reservas DELETE] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al eliminar la reserva' }, { status: 500 });
  }
}
