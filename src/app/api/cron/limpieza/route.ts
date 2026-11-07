import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/limpieza
 *
 * Limpieza periódica de public.intentos_login (contador de rate limiting).
 * Borra filas vencidas: sin actividad hace más de 1 día y sin bloqueo
 * vigente. Lo invoca un servicio externo cada día (mismo Bearer
 * CRON_SECRET que el motor de ausencias). Falla cerrado sin secreto.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = getSupabaseReservasAdmin();
  const corte = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from('intentos_login')
    .delete()
    .lt('actualizado_en', corte)
    .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${ahora}`)
    .select('clave');

  if (error) {
    console.error('[cron/limpieza] Error al limpiar intentos_login:', error);
    return NextResponse.json(
      { error: 'Error interno en la limpieza' },
      { status: 500 }
    );
  }

  const eliminadas = data?.length ?? 0;
  console.log('[cron/limpieza] filas eliminadas:', eliminadas);

  return NextResponse.json(
    { ok: true, eliminadas },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
