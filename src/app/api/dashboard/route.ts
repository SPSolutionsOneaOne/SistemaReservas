import { NextRequest, NextResponse } from 'next/server';
import { authorize, ROLES_STAFF } from '@/lib/authz';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { obtenerClaveCliente } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard — 4 tarjetas para el Encargado/Administrador:
 * 1) ocupación de la semana + top 5 salas
 * 2) tasa de asistencia real (completada vs no_asistio)
 * 3) bloqueos activos (RN05)
 * 4) últimas 10 acciones de bitácora
 * Sólo ROLES_STAFF. Sin RUT de terceros en las tarjetas 1/2.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request, ROLES_STAFF);
    if (!auth.ok) return auth.response;

    const supabase = getSupabaseReservasAdmin();
    const hoy = new Date();
    const hoyIso = new Date(hoy.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10);

    // Ventana de los próximos 7 días (lunes a domingo de la semana actual)
    const inicio = new Date(hoy);
    const diaSemana = inicio.getUTCDay() || 7;
    inicio.setUTCDate(inicio.getUTCDate() - diaSemana + 1);
    const fin = new Date(inicio);
    fin.setUTCDate(fin.getUTCDate() + 7);
    const inicioIso = inicio.toISOString().slice(0, 10);
    const finIso = fin.toISOString().slice(0, 10);

    const [reservasSemana, salas, historial, bitacora] = await Promise.all([
      supabase
        .from('reservas')
        .select('id_sala, fecha, bloque_horario, estado')
        .gte('fecha', inicioIso)
        .lt('fecha', finIso)
        .in('estado', ['confirmada', 'completada'])
        .limit(5000),
      supabase
        .from('salas')
        .select('id_sala, nombre_descriptivo, tipo, estado_habilitacion')
        .eq('estado_habilitacion', 'activo')
        .limit(500),
      supabase
        .from('historial_penalizaciones')
        .select('usuario_rut, ausencias_acumuladas, bloqueado_hasta')
        .not('bloqueado_hasta', 'is', null)
        .gte('bloqueado_hasta', new Date().toISOString())
        .limit(200),
      supabase
        .from('bitacora_administrativa')
        .select('id, encargado_rut, accion, rut_estudiante_afectado, creado_en')
        .order('creado_en', { ascending: false })
        .limit(10),
    ]);

    if (reservasSemana.error || salas.error || historial.error || bitacora.error) {
      console.error('[dashboard] Error de BD', {
        reservas: reservasSemana.error?.message,
        salas: salas.error?.message,
        historial: historial.error?.message,
        bitacora: bitacora.error?.message,
      });
      return NextResponse.json({ error: 'Error interno al cargar el panel' }, { status: 500 });
    }

    const porDia: Record<string, number> = {};
    const porSala: Record<string, number> = {};
    (reservasSemana.data || []).forEach((r) => {
      porDia[r.fecha] = (porDia[r.fecha] || 0) + 1;
      porSala[r.id_sala] = (porSala[r.id_sala] || 0) + 1;
    });

    const topSalas = Object.entries(porSala)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id_sala, total]) => ({
        id_sala,
        nombre: salas.data?.find((s) => s.id_sala === id_sala)?.nombre_descriptivo || id_sala,
        total,
      }));

    // Tasa de asistencia sobre reservas ya vencidas (histórico, no hoy en curso)
    const { data: asistencia } = await supabase
      .from('reservas')
      .select('estado')
      .lt('fecha', hoyIso)
      .in('estado', ['completada', 'no_asistio'])
      .limit(10000);
    const completadas = (asistencia || []).filter((r) => r.estado === 'completada').length;
    const noAsistio = (asistencia || []).filter((r) => r.estado === 'no_asistio').length;
    const totalAsistencia = completadas + noAsistio;
    const pctAsistencia = totalAsistencia
      ? Math.round((completadas / totalAsistencia) * 1000) / 10
      : 0;
    const semaforo = pctAsistencia >= 80 ? 'verde' : pctAsistencia >= 60 ? 'amarillo' : 'rojo';

    // Bitácora: el encargado ve todo; un administrador también. No se expone
    // a roles no-staff (middleware + authorize ya lo garantizan).
    void obtenerClaveCliente(request); // mantiene consistencia con el resto de rutas

    return NextResponse.json(
      {
        ocupacion: {
          desde: inicioIso,
          hasta: finIso,
          porDia: Object.entries(porDia)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([fecha, total]) => ({ fecha, total })),
          topSalas,
          salasActivas: salas.data?.length || 0,
        },
        asistencia: {
          completadas,
          no_asistio: noAsistio,
          porcentaje: pctAsistencia,
          semaforo,
        },
        bloqueosActivos: (historial.data || []).map((h) => ({
          usuario_rut: h.usuario_rut,
          ausencias_acumuladas: h.ausencias_acumuladas,
          bloqueado_hasta: h.bloqueado_hasta,
        })),
        bitacora: (bitacora.data || []).map((b) => ({
          id: b.id,
          encargado_rut: b.encargado_rut,
          accion: b.accion,
          rut_estudiante_afectado: b.rut_estudiante_afectado,
          creado_en: b.creado_en,
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    console.error('[dashboard] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al cargar el panel' }, { status: 500 });
  }
}
