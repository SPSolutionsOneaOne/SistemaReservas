import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { SalaFactory } from '@/models/SalaFactory';
import { TipoSala, EstadoHabilitacion } from '@/types/database';
import { validarPiso } from '@/lib/validators';
import { authorize } from '@/lib/authz';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo') as TipoSala | null;
    const piso = searchParams.get('piso');
    const estado = searchParams.get('estado') as EstadoHabilitacion | null;

    const supabase = getSupabaseReservasAdmin();
    let query = supabase.from('salas').select('*');

    if (tipo) query = query.eq('tipo', tipo);
    if (piso) query = query.eq('piso', parseInt(piso, 10));
    if (estado) query = query.eq('estado_habilitacion', estado);

    const { data, error } = await query.order('id_sala', { ascending: true });

    if (error) {
      console.error('[salas GET] Error al consultar salas:', error);
      return NextResponse.json({ error: 'Error interno al consultar salas' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error('[salas GET] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al consultar salas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request, ['administrador']);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { nombre_descriptivo, tipo, aforo, piso, estado_habilitacion } = body;

    if (!nombre_descriptivo || !tipo || !aforo || !piso) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre_descriptivo, tipo, aforo, piso' },
        { status: 400 }
      );
    }

    const tiposValidos: TipoSala[] = ['lab', 'sala', 'aud', 'conf', 'bib'];
    if (!tiposValidos.includes(tipo)) {
      return NextResponse.json({ error: 'Tipo de sala inválido' }, { status: 400 });
    }

    const estadosValidos: EstadoHabilitacion[] = ['activo', 'mantencion', 'inactivo'];
    if (estado_habilitacion && !estadosValidos.includes(estado_habilitacion)) {
      return NextResponse.json({ error: 'Estado de habilitación inválido' }, { status: 400 });
    }

    if (typeof nombre_descriptivo !== 'string' || nombre_descriptivo.trim().length === 0) {
      return NextResponse.json({ error: 'El nombre descriptivo es inválido' }, { status: 400 });
    }

    if (aforo <= 0) {
      return NextResponse.json({ error: 'El aforo debe ser mayor a 0' }, { status: 400 });
    }

    if (!validarPiso(piso)) {
      return NextResponse.json({ error: 'El piso debe estar entre 1 y 9' }, { status: 400 });
    }

    const nuevaSala = await SalaFactory.crearSala({
      nombre_descriptivo,
      tipo,
      aforo: Number(aforo),
      piso: Number(piso),
      estado_habilitacion: estado_habilitacion || 'activo',
    });

    return NextResponse.json(nuevaSala, { status: 201 });
  } catch (err: unknown) {
    console.error('[salas POST] Error inesperado:', err);
    return NextResponse.json({ error: 'Error interno al procesar la creación de sala' }, { status: 500 });
  }
}
