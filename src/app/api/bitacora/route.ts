import { NextRequest, NextResponse } from 'next/server';
import { registrarBitacora } from '@/controllers/reservasController';
import { validarRutChileno } from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { encargado_rut, accion, rut_estudiante_afectado } = body;

    if (!encargado_rut || !accion || !rut_estudiante_afectado) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: encargado_rut, accion, rut_estudiante_afectado' },
        { status: 400 }
      );
    }

    if (!validarRutChileno(encargado_rut)) {
      return NextResponse.json({ error: 'RUT de encargado inválido' }, { status: 400 });
    }

    if (!validarRutChileno(rut_estudiante_afectado)) {
      return NextResponse.json({ error: 'RUT de estudiante afectado inválido' }, { status: 400 });
    }

    await registrarBitacora({
      encargado_rut,
      accion,
      rut_estudiante_afectado,
    });

    return NextResponse.json({ mensaje: 'Bitácora registrada con éxito' }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al registrar bitácora';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
