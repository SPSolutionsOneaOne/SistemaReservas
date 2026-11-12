import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseInstitucionalAdmin } from '@/lib/supabaseInstitucionalAdmin';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { validarRutChileno, validarCorreoInstitucional } from '@/lib/validators';
import { HistorialPenalizacion } from '@/types/database';
import { authorize, ROLES_STAFF } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    // Solo usuarios autenticados pueden validar RUTs.
    const auth = await authorize(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { rut } = body;

    if (!rut) {
      return NextResponse.json({ error: 'El RUT es requerido' }, { status: 400 });
    }

    if (!validarRutChileno(rut)) {
      return NextResponse.json({ error: 'RUT chileno inválido (dígito verificador incorrecto)' }, { status: 400 });
    }

    // 1. Buscar en DB-Institucional
    const supabaseInst = getSupabaseInstitucionalAdmin();
    const { data: usuario, error: errUsuario } = await supabaseInst
      .from('usuarios_institucion')
      .select('rut, nombre_completo, correo_institucional, rol, carrera_o_departamento, estado_activo')
      .eq('rut', rut)
      .single();

    if (errUsuario || !usuario) {
      return NextResponse.json(
        { error: 'No encontramos este RUT en el registro institucional' },
        { status: 404 }
      );
    }

    if (!usuario.estado_activo) {
      return NextResponse.json(
        { error: 'El usuario se encuentra inactivo en el sistema institucional' },
        { status: 403 }
      );
    }

    if (!validarCorreoInstitucional(usuario.correo_institucional)) {
      return NextResponse.json(
        { error: 'El correo institucional no cumple con los dominios permitidos' },
        { status: 403 }
      );
    }

    // 2. Comprobar penalizaciones en DB-Reservas
    // (limit aleatorio: la capa de red cachea GET por URL exacta)
    const supabaseRes = getSupabaseReservasAdmin();
    const { data: penal } = await supabaseRes
      .from('historial_penalizaciones')
      .select('*')
      .eq('usuario_rut', rut)
      .limit(10000 + Math.floor(Math.random() * 1000))
      .single();

    let bloqueado = false;
    let mensajeBloqueo: string | null = null;

    if (penal) {
      const p = penal as HistorialPenalizacion;
      if (p.bloqueado_hasta && new Date() < new Date(p.bloqueado_hasta)) {
        bloqueado = true;
        mensajeBloqueo = `Usuario bloqueado hasta ${new Date(p.bloqueado_hasta).toLocaleString('es-CL')} por acumulación de ${p.ausencias_acumuladas} ausencias sin justificar.`;
      }
    }

    // 3. Todos los usuarios autenticados ven RUT + nombre al validar un
    //    asistente (RF-USA-06: la identidad se obtiene de la sesión y el
    //    padrón, sin ingreso manual). Carrera y correo se reservan al
    //    personal administrativo; nunca se entregan fuera de sesión.
    const base = { rut: usuario.rut, nombre_completo: usuario.nombre_completo };
    const enriquecido = ROLES_STAFF.includes(auth.session.rol)
      ? { ...base, carrera_o_departamento: usuario.carrera_o_departamento, estado_activo: usuario.estado_activo }
      : { ...base, estado_activo: usuario.estado_activo };

    return NextResponse.json(
      { usuario: enriquecido, bloqueado, mensajeBloqueo },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    console.error('[usuarios/validar] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al validar usuario' }, { status: 500 });
  }
}
