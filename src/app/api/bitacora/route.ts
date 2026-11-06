import { NextRequest, NextResponse } from 'next/server';
import { registrarBitacora } from '@/controllers/reservasController';
import { validarRutChileno } from '@/lib/validators';
import { authorize, ROLES_STAFF } from '@/lib/authz';

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ROLES_STAFF);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { accion, rut_estudiante_afectado } = body;

    if (!accion || !rut_estudiante_afectado) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: accion, rut_estudiante_afectado' },
        { status: 400 }
      );
    }

    if (!validarRutChileno(rut_estudiante_afectado)) {
      return NextResponse.json({ error: 'RUT de estudiante afectado inválido' }, { status: 400 });
    }

    // El encargado se toma de la sesión firmada, nunca del cuerpo de la petición.
    await registrarBitacora({
      encargado_rut: auth.session.rut,
      accion,
      rut_estudiante_afectado,
    });

    return NextResponse.json({ mensaje: 'Bitácora registrada con éxito' }, { status: 201 });
  } catch (err: unknown) {
    console.error('[bitacora POST] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al registrar bitácora' }, { status: 500 });
  }
}
