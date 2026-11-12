// ============================================================
// API: /api/salas/qr — Datos para módulos QR físicos (admin)
//   GET ?id_sala=AAA-00   → QR/manual de una sala
//   GET                   → todos los QR (grid del módulo QR)
// Solo Administrador: qr_token y codigo_manual son secretos
// de asistencia presencial y nunca se exponen a otros roles.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { authorize } from '@/lib/authz';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const id_sala = searchParams.get('id_sala');

    const supabase = getSupabaseReservasAdmin();
    let query = supabase
      .from('salas')
      .select('id_sala, nombre_descriptivo, tipo, aforo, piso, estado_habilitacion, qr_token, codigo_manual, tipos_sala(color)')
      .order('id_sala', { ascending: true });

    if (id_sala) query = query.eq('id_sala', id_sala);

    const { data, error } = await query;

    if (error) {
      console.error('[salas/qr GET] Error al consultar salas:', error);
      return NextResponse.json({ error: 'Error interno al consultar los QR de salas' }, { status: 500 });
    }

    if (id_sala && (!data || data.length === 0)) {
      return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });
    }

    // Aplanar join tipos_sala(color) → color
    const filas = (data ?? []).map((s) => {
      const rel = (s as unknown as { tipos_sala?: { color?: string } | { color?: string }[] | null }).tipos_sala;
      const color = Array.isArray(rel) ? rel[0]?.color : rel?.color;
      const { tipos_sala: _ts, ...resto } = s as unknown as Record<string, unknown>;
      return { ...resto, color };
    });

    const payload = id_sala ? filas[0] : filas;

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err: unknown) {
    console.error('[salas/qr GET] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al consultar los QR de salas' }, { status: 500 });
  }
}
