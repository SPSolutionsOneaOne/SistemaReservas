import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { SalaFactory } from '@/models/SalaFactory';
import { TipoSala, EstadoHabilitacion } from '@/types/database';
import { validarPiso } from '@/lib/validators';
import { authorize } from '@/lib/authz';
import { ahoraSantiago, enFranjaDeUso } from '@/lib/horarios';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo') as TipoSala | null;
    const piso = searchParams.get('piso');
    const estado = searchParams.get('estado') as EstadoHabilitacion | null;

    const supabase = getSupabaseReservasAdmin();
    let query = supabase.from('salas').select('*');

    if (tipo) query = query.eq('tipo', tipo);
    if (piso) query = query.eq('piso', parseInt(piso, 10));
    if (estado) query = query.eq('estado_habilitacion', estado);

    const { data, error } = await query.order('id_sala', { ascending: true });

    if (error) {
      console.error('[salas GET] Error al consultar salas:', error);
      return NextResponse.json({ error: 'Error interno al consultar salas' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[salas GET] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al consultar salas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { nombre_descriptivo, tipo, aforo, piso, estado_habilitacion } = body;

    if (!nombre_descriptivo || !tipo || !aforo || !piso) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre_descriptivo, tipo, aforo, piso' },
        { status: 400 }
      );
    }

    // Validar tipo contra el catálogo dinámico tipos_sala (DB-Reservas)
    const supabase = getSupabaseReservasAdmin();
    const { data: tipoRow, error: errTipo } = await supabase
      .from('tipos_sala')
      .select('id')
      .eq('id', tipo)
      .maybeSingle();

    if (errTipo) {
      console.error('[salas POST] Error consultando tipos_sala:', errTipo);
      return NextResponse.json({ error: 'Error interno al validar el tipo de sala' }, { status: 500 });
    }
    if (!tipoRow) {
      return NextResponse.json({ error: 'Tipo de sala inválido' }, { status: 400 });
    }

    const estadosValidos: EstadoHabilitacion[] = ['activo', 'mantencion', 'inactivo'];
    if (estado_habilitacion && !estadosValidos.includes(estado_habilitacion)) {
      return NextResponse.json({ error: 'Estado de habilitación inválido' }, { status: 400 });
    }

    if (typeof nombre_descriptivo !== 'string' || nombre_descriptivo.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre descriptivo es inválido' }, { status: 400 });
    }

    if (aforo <= 0) {
      return NextResponse.json({ error: 'El aforo debe ser mayor a 0' }, { status: 400 });
    }

    if (!validarPiso(piso)) {
      return NextResponse.json({ error: 'El piso debe estar entre 1 y 9' }, { status: 400 });
    }

    const nuevaSala = await SalaFactory.crearSala({
      nombre_descriptivo,
      tipo,
      aforo: Number(aforo),
      piso: Number(piso),
      estado_habilitacion: estado_habilitacion || 'activo',
    });

    return NextResponse.json(nuevaSala, { status: 201 });
  } catch (err: unknown) {
    console.error('[salas POST] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al procesar la creación de sala' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { id_sala, nombre_descriptivo, aforo, piso, estado_habilitacion } = body;

    if (!id_sala) {
      return NextResponse.json({ error: 'id_sala es requerido' }, { status: 400 });
    }

    if (nombre_descriptivo !== undefined && (typeof nombre_descriptivo !== 'string' || nombre_descriptivo.trim().length === 0)) {
      return NextResponse.json({ error: 'El nombre descriptivo es inválido' }, { status: 400 });
    }

    if (aforo !== undefined && !(Number(aforo) > 0)) {
      return NextResponse.json({ error: 'El aforo debe ser mayor a 0' }, { status: 400 });
    }

    if (piso !== undefined && !validarPiso(Number(piso))) {
      return NextResponse.json({ error: 'El piso debe estar entre 1 y 9' }, { status: 400 });
    }

    const estadosValidos: EstadoHabilitacion[] = ['activo', 'mantencion', 'inactivo'];
    if (estado_habilitacion !== undefined && !estadosValidos.includes(estado_habilitacion)) {
      return NextResponse.json({ error: 'Estado de habilitación inválido' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    if (nombre_descriptivo !== undefined) updatePayload.nombre_descriptivo = nombre_descriptivo.trim();
    if (aforo !== undefined) updatePayload.aforo = Number(aforo);
    if (piso !== undefined) updatePayload.piso = Number(piso);
    if (estado_habilitacion !== undefined) updatePayload.estado_habilitacion = estado_habilitacion;

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase
      .from('salas')
      .update(updatePayload)
      .eq('id_sala', id_sala)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe una sala con ese nombre' }, { status: 409 });
      }
      console.error('[salas PATCH] Error al actualizar sala:', error);
      return NextResponse.json({ error: 'Error interno al actualizar la sala' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[salas PATCH] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al actualizar la sala' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id_sala = searchParams.get('id_sala');

    if (!id_sala) {
      return NextResponse.json({ error: 'id_sala es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();

    const { data: sala, error: errSala } = await supabase
      .from('salas')
      .select('id_sala')
      .eq('id_sala', id_sala)
      .single();

    if (errSala || !sala) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    // Restricción: si la sala tiene reservas activas, no se puede eliminar.
    const hoy = ahoraSantiago().fecha;
    const { count } = await supabase
      .from('reservas')
      .select('id_reserva', { count: 'exact', head: true })
      .eq('id_sala', id_sala)
      .eq('estado', 'confirmada')
      .gte('fecha', hoy);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'No se pueden eliminar salas con reservas activas' },
        { status: 409 }
      );
    }

    // Restricción: en franja de uso (lun–vie 08:30–22:00, sáb 08:30–14:00)
    // no se puede eliminar salas. Agregar/editar sí están permitidos.
    if (enFranjaDeUso()) {
      return NextResponse.json(
        { error: 'No se puede eliminar salas durante la franja de uso' },
        { status: 409 }
      );
    }

    const { error: errDelete } = await supabase
      .from('salas')
      .delete()
      .eq('id_sala', id_sala);

    if (errDelete) {
      console.error('[salas DELETE] Error al eliminar sala:', errDelete);
      return NextResponse.json({ error: 'Error interno al eliminar la sala' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id_sala });
  } catch (err: unknown) {
    console.error('[salas DELETE] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al eliminar la sala' }, { status: 500 });
  }
}
