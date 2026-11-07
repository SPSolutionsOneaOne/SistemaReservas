import { NextRequest, NextResponse } from 'next/server';
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

    // Se usa fetch directo a PostgREST (sin supabase-js) porque el SDK de
    // Supabase implementa caché en memoria de respuestas para queries
    // idénticas dentro de una misma instancia: tras un INSERT, una query
    // igual a la anterior (vacía) devuelve 200 con 0 filas aunque la fila
    // ya exista y /api/reservas sí la devuelva. Con fetch en cada request
    // hay instancia nueva y la lectura es siempre consistente.
    //
    // NOTA: no se usa estado!=cancelada. La restricción
    // UNIQUE(id_sala, fecha, bloque_horario) garantiza que una reserva
    // cancelada debe eliminarse o editarse (no hay camino de cancelación
    // activado en la UI), por lo que cualquier fila existente bloquea.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL?.trim();
    const supabaseKey = process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY?.trim();
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta' },
        { status: 500 }
      );
    }

    let postgrestUrl = `${supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '')}/rest/v1/reservas?select=id_sala,bloque_horario&fecha=eq.${encodeURIComponent(fecha)}`;
    if (id_sala) {
      postgrestUrl += `&id_sala=eq.${encodeURIComponent(id_sala)}`;
    }

    const resp = await fetch(postgrestUrl, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    });

    let data: Array<{ id_sala: string; bloque_horario: number }> | null = null;
    try {
      const body = await resp.json();
      if (!resp.ok) throw new Error('PostgREST respondió error');
      data = Array.isArray(body)
        ? (body as Array<{ id_sala: string; bloque_horario: number }>)
        : null;
    } catch {
      return NextResponse.json(
        { error: 'Error interno al consultar la disponibilidad' },
        { status: 500 }
      );
    }
    if (data === null) {
      return NextResponse.json(
        { error: 'Error interno al consultar la disponibilidad' },
        { status: 500 }
      );
    }

    const ocupacion = data.map((row) => ({
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
