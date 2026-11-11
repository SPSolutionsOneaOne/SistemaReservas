// ============================================================
// API: /api/tipos-sala — Catálogo dinámico de tipos de sala
//   GET     lista tipos (cualquier usuario autenticado)
//   POST    crea tipo (solo administrador)
//   PATCH   edita tipo (solo administrador)
//   DELETE  elimina tipo (solo administrador)
//           Bloqueado si el tipo tiene salas con reservas
//           confirmadas futuras, o salas asociadas sin reservas
//           activas (mensaje explicando la causa).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { authorize } from '@/lib/authz';
import { ahoraSantiago } from '@/lib/horarios';

const PREFIJO_RE = /^[A-Za-z]{2,5}$/;
const ID_RE = /^[a-z0-9_]{2,20}$/;
const COLOR_RE = /^(#[0-9a-fA-F]{6}|var\(--[a-z0-9-]+\))$/;

function normalizarPrefijo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const limpio = v.trim().toUpperCase();
  return PREFIJO_RE.test(limpio) ? limpio : null;
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase
      .from('tipos_sala')
      .select('id, nombre, prefijo, aforo_sugerido, color, orden, creado_en')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true });

    if (error) {
      console.error('[tipos-sala GET] Error al consultar tipos:', error);
      return NextResponse.json({ error: 'Error interno al consultar los tipos de sala' }, { status: 500 });
    }

    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    console.error('[tipos-sala GET] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al consultar los tipos de sala' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const nombre = typeof body?.nombre === 'string' ? body.nombre.trim() : '';
    const prefijo = normalizarPrefijo(body?.prefijo);
    const aforo = body?.aforo_sugerido !== undefined ? Number(body.aforo_sugerido) : 30;
    const color = typeof body?.color === 'string' && COLOR_RE.test(body.color.trim()) ? body.color.trim() : '#5B9BD5';
    const orden = body?.orden !== undefined ? Number(body.orden) : 0;
    // id derivado del prefijo si no se entrega: 'LAB' -> 'lab'
    const id =
      typeof body?.id === 'string' && body.id.trim()
        ? body.id.trim().toLowerCase()
        : prefijo
          ? prefijo.toLowerCase()
          : '';

    if (!nombre) {
      return NextResponse.json({ error: 'El nombre del tipo es requerido' }, { status: 400 });
    }
    if (!prefijo) {
      return NextResponse.json({ error: 'El prefijo es requerido y debe tener entre 2 y 5 letras (ej: LAB)' }, { status: 400 });
    }
    if (!ID_RE.test(id)) {
      return NextResponse.json({ error: 'El identificador del tipo debe ser minúsculas, números o guion bajo (2-20 caracteres)' }, { status: 400 });
    }
    if (!Number.isInteger(aforo) || aforo <= 0) {
      return NextResponse.json({ error: 'El aforo sugerido debe ser un entero mayor a 0' }, { status: 400 });
    }
    if (!Number.isInteger(orden)) {
      return NextResponse.json({ error: 'El orden debe ser un entero' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();

    // Chequeos amigables de unicidad (la BD también tiene UNIQUE como respaldo)
    const { data: existentes } = await supabase
      .from('tipos_sala')
      .select('id, nombre, prefijo')
      .or(`id.eq.${id},nombre.eq.${nombre},prefijo.eq.${prefijo}`);

    if (existentes && existentes.length > 0) {
      const choque = existentes[0];
      const campo =
        choque.id === id ? `el identificador '${id}'`
        : choque.prefijo === prefijo ? `el prefijo '${prefijo}'`
        : `el nombre '${nombre}'`;
      return NextResponse.json(
        { error: `Ya existe un tipo de sala con ${campo}` },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from('tipos_sala')
      .insert({ id, nombre, prefijo, aforo_sugerido: aforo, color, orden })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un tipo de sala con ese identificador, nombre o prefijo' }, { status: 409 });
      }
      console.error('[tipos-sala POST] Error al insertar:', error);
      return NextResponse.json({ error: 'Error interno al crear el tipo de sala' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: unknown) {
    console.error('[tipos-sala POST] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al crear el tipo de sala' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id.trim().toLowerCase() : '';

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};

    if (body?.nombre !== undefined) {
      const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
      if (!nombre) return NextResponse.json({ error: 'El nombre no puede estar vacío' }, { status: 400 });
      updatePayload.nombre = nombre;
    }
    if (body?.prefijo !== undefined) {
      const prefijo = normalizarPrefijo(body.prefijo);
      if (!prefijo) return NextResponse.json({ error: 'El prefijo debe tener entre 2 y 5 letras (ej: LAB)' }, { status: 400 });
      updatePayload.prefijo = prefijo;
    }
    if (body?.aforo_sugerido !== undefined) {
      const aforo = Number(body.aforo_sugerido);
      if (!Number.isInteger(aforo) || aforo <= 0) {
        return NextResponse.json({ error: 'El aforo sugerido debe ser un entero mayor a 0' }, { status: 400 });
      }
      updatePayload.aforo_sugerido = aforo;
    }
    if (body?.color !== undefined) {
      const color = typeof body.color === 'string' ? body.color.trim() : '';
      if (!COLOR_RE.test(color)) {
        return NextResponse.json({ error: 'Color inválido (use #RRGGBB)' }, { status: 400 });
      }
      updatePayload.color = color;
    }
    if (body?.orden !== undefined) {
      const orden = Number(body.orden);
      if (!Number.isInteger(orden)) {
        return NextResponse.json({ error: 'El orden debe ser un entero' }, { status: 400 });
      }
      updatePayload.orden = orden;
    }

    if (Object.keys(updatePayload).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase
      .from('tipos_sala')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Tipo de sala no encontrado' }, { status: 404 });
      }
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Ya existe un tipo con ese nombre o prefijo' }, { status: 409 });
      }
      console.error('[tipos-sala PATCH] Error al actualizar:', error);
      return NextResponse.json({ error: 'Error interno al actualizar el tipo de sala' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[tipos-sala PATCH] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al actualizar el tipo de sala' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim().toLowerCase();

    if (!id) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    const supabase = getSupabaseReservasAdmin();

    const { data: tipo, error: errTipo } = await supabase
      .from('tipos_sala')
      .select('id, nombre')
      .eq('id', id)
      .maybeSingle();

    if (errTipo || !tipo) {
      return NextResponse.json({ error: 'Tipo de sala no encontrado' }, { status: 404 });
    }

    // Salas asociadas al tipo
    const { data: salasTipo, error: errSalas } = await supabase
      .from('salas')
      .select('id_sala')
      .eq('tipo', id);

    if (errSalas) {
      console.error('[tipos-sala DELETE] Error consultando salas:', errSalas);
      return NextResponse.json({ error: 'Error interno al verificar salas asociadas' }, { status: 500 });
    }

    const codigos = (salasTipo ?? []).map((s) => s.id_sala as string);

    if (codigos.length > 0) {
      // Salas con reservas confirmadas futuras del tipo
      const hoy = ahoraSantiago().fecha;
      const { data: reservasActivas } = await supabase
        .from('reservas')
        .select('id_sala')
        .in('id_sala', codigos)
        .eq('estado', 'confirmada')
        .gte('fecha', hoy);

      const conActivas = Array.from(new Set((reservasActivas ?? []).map((r) => r.id_sala as string)));

      if (conActivas.length > 0) {
        const muestra = conActivas.slice(0, 5).join(', ');
        const extra = conActivas.length > 5 ? ` y ${conActivas.length - 5} más` : '';
        return NextResponse.json(
          {
            error:
              `No se puede eliminar el tipo de sala '${tipo.nombre}' porque contiene salas con reservas activas ` +
              `(${conActivas.length}): ${muestra}${extra}. ` +
              `Cancela esas reservas o reasigna/elimina las salas y vuelve a intentarlo.`,
          },
          { status: 409 }
        );
      }

      const nSalas = codigos.length;
      return NextResponse.json(
        {
          error:
            `No es posible eliminar el tipo de sala '${tipo.nombre}' porque todavía tiene ${nSalas} ` +
            `${nSalas === 1 ? 'sala' : 'salas'} asociada${nSalas === 1 ? '' : 's'}. ` +
            `Elimina o reasigna ${nSalas === 1 ? 'esa sala' : 'esas salas'} primero.`,
        },
        { status: 409 }
      );
    }

    const { error: errDelete } = await supabase
      .from('tipos_sala')
      .delete()
      .eq('id', id);

    if (errDelete) {
      console.error('[tipos-sala DELETE] Error al eliminar:', errDelete);
      return NextResponse.json({ error: 'Error interno al eliminar el tipo de sala' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (err: unknown) {
    console.error('[tipos-sala DELETE] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al eliminar el tipo de sala' }, { status: 500 });
  }
}
