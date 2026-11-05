import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseInstitucional } from '@/lib/supabaseInstitucional';
import { getSupabaseReservas } from '@/lib/supabaseReservas';
import { validarRutChileno, validarCorreoInstitucional } from '@/lib/validators';
import { HistorialPenalizacion } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rut } = body;

    if (!rut) {
      return NextResponse.json({ error: 'El RUT es requerido' }, { status: 400 });
    }

    if (!validarRutChileno(rut)) {
      return NextResponse.json({ error: 'RUT chileno inválido (dígito verificador incorrecto)' }, { status: 400 });
    }

    // 1. Buscar en DB-Institucional
    const supabaseInst = getSupabaseInstitucional();
    const { data: usuario, error: errUsuario } = await supabaseInst
      .from('usuarios_institucion')
      .select('id, rut, nombre_completo, correo_institucional, rol, carrera_o_departamento, estado_activo')
      .eq('rut', rut)
      .single();

    if (errUsuario || !usuario) {
      return NextResponse.json(
        { error: 'Usuario no registrado en el padrón institucional (DB-Institucional)' },
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
        { error: 'El correo institucional no cumple con los dominios permitidos (@institucion.cl / @inacapmail.cl - RN04)' },
        { status: 403 }
      );
    }

    // 2. Comprobar penalizaciones en DB-Reservas
    const supabaseRes = getSupabaseReservas();
    const { data: penal } = await supabaseRes
      .from('historial_penalizaciones')
      .select('*')
      .eq('usuario_rut', rut)
      .single();

    let bloqueado = false;
    let mensajeBloqueo = null;

    if (penal) {
      const p = penal as HistorialPenalizacion;
      if (p.bloqueado_hasta && new Date() < new Date(p.bloqueado_hasta)) {
        bloqueado = true;
        mensajeBloqueo = `Usuario bloqueado hasta ${new Date(p.bloqueado_hasta).toLocaleString('es-CL')} por acumulación de ${p.ausencias_acumuladas} ausencias sin justificar.`;
      }
    }

    return NextResponse.json({
      usuario,
      penalizacion: penal || null,
      bloqueado,
      mensajeBloqueo,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al validar usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
