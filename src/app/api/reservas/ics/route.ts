import { NextRequest, NextResponse } from 'next/server';
import { authorize, ROLES_STAFF } from '@/lib/authz';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { getSupabaseInstitucionalAdmin } from '@/lib/supabaseInstitucionalAdmin';
import { GeneradorICS } from '@/services/GeneradorICS';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reservas/ics?id_reserva=UUID — descarga el evento .ics
 * de una reserva. Sólo el titular o personal staff (RBAC).
 */
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const idReserva = new URL(request.url).searchParams.get('id_reserva');
  if (!idReserva) {
    return NextResponse.json({ error: 'id_reserva es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseReservasAdmin();
  const { data: reserva } = await supabase
    .from('reservas')
    .select('*')
    .eq('id_reserva', idReserva)
    .single();

  if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });

  const esStaff = ROLES_STAFF.includes(auth.session.rol);
  if (!esStaff && reserva.usuario_rut !== auth.session.rut) {
    return NextResponse.json({ error: 'No autorizado para ver esta reserva' }, { status: 403 });
  }

  const { data: sala } = await supabase
    .from('salas')
    .select('*')
    .eq('id_sala', reserva.id_sala)
    .single();

  if (!sala) return NextResponse.json({ error: 'Sala no encontrada' }, { status: 404 });

  const supabaseInst = getSupabaseInstitucionalAdmin();
  const { data: usuario } = await supabaseInst
    .from('usuarios_institucion')
    .select('nombre_completo, correo_institucional')
    .eq('rut', reserva.usuario_rut)
    .maybeSingle();

  const ics = GeneradorICS.generarContenidoICS({
    reserva,
    sala,
    correoTitular: usuario?.correo_institucional || '',
    nombreTitular: usuario?.nombre_completo || '',
    correosAsistentes: [],
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="reserva-${reserva.codigo_reserva}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
