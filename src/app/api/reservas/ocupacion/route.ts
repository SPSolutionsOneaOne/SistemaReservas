import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorize } from '@/lib/authz';

export const dynamic = 'force-dynamic';

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Verifica que la fecha exista realmente en el calendario.
 * Evita que valores como 2026-02-31 lleguen a la consulta.
 */
function esFechaValida(fecha: string): boolean {
  if (!FECHA_RE.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const date = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    date.getUTCFullYear() === anio &&
    date.getUTCMonth() === mes - 1 &&
    date.getUTCDate() === dia
  );
}

/**
 * GET /api/reservas/ocupacion?fecha=YYYY-MM-DD[&id_sala=AAA-00]
 *
 * Devuelve únicamente qué bloques están ocupados para una fecha.
 * No expone RUT, propósito ni ningún dato personal de las reservas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get('fecha');
    const id_sala = searchParams.get('id_sala');

    if (!fecha || !esFechaValida(fecha)) {
      return NextResponse.json(
        { error: 'Parámetro fecha inválido. Use el formato YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    // Cliente dedicado con no-store: las réplicas de lectura de Supabase
    // pueden servir cachés de lista muy breves tras un INSERT (query casi
    // idéntica a la anterior devuelve 200 con 0 filas aunque la reserva ya
    // existe y /api/reservas la devuelve). Forzar no-store evita que el
    // cliente lea respuestas cacheadas de la capa de red.
    //
    // NOTA: no se usa .neq('estado', 'cancelada') aquí. La restricción
    // UNIQUE(id_sala, fecha, bloque_horario) garantiza que una reserva
    // cancelada debe eliminarse o editarse (no hay camino de cancelación
    // activado en la UI), por lo que cualquier fila existente bloquea.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL;
    const supabaseKey = process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta' },
        { status: 500 }
      );
    }
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
      },
    });

    let query = supabase
      .from('reservas')
      .select('id_sala, bloque_horario')
      .eq('fecha', fecha);

    if (id_sala) query = query.eq('id_sala', id_sala);

    const { data, error } = await query;

    if (error) {
      console.error('[reservas/ocupacion] Error al consultar ocupación:', error);
      return NextResponse.json(
        { error: 'Error interno al consultar la disponibilidad' },
        { status: 500 }
      );
    }

    const ocupacion = (data ?? []).map((row) => ({
      id_sala: row.id_sala as string,
      bloque_horario: row.bloque_horario as number,
    }));

    return NextResponse.json(
      { fecha, ocupacion },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    console.error('[reservas/ocupacion] Error inesperado:', err);
    return NextResponse.json(
      { error: 'Error interno al consultar la disponibilidad' },
      { status: 500 }
    );
  }
}
