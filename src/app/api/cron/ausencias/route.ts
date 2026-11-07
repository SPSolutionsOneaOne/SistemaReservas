import { NextRequest, NextResponse } from 'next/server';
import { procesarInasistencias } from '@/controllers/reservasController';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/ausencias
 *
 * Lo invoca Vercel Cron cada 10 minutos. Protegido con
 * Authorization: Bearer <CRON_SECRET>. Falla cerrado si el secreto
 * no está configurado.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const resumen = await procesarInasistencias();
  console.log('[cron/ausencias]', resumen);

  return NextResponse.json(
    { ok: true, ...resumen },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
