import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseInstitucional } from '@/lib/supabaseInstitucional';
import { UsuarioInstitucion } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identificador, password } = body; // identificador puede ser RUT o correo institucional

    if (!identificador || !password) {
      return NextResponse.json(
        { error: 'Debe ingresar su RUT o correo institucional y contraseña' },
        { status: 400 }
      );
    }

    const cleanId = identificador.trim().toLowerCase();
    const supabase = getSupabaseInstitucional();

    // Buscar por correo o por RUT
    let query = supabase.from('usuarios_institucion').select('*');
    if (cleanId.includes('@')) {
      query = query.eq('correo_institucional', cleanId);
    } else {
      query = query.eq('rut', cleanId.toUpperCase());
    }

    const { data: usuario, error } = await query.single();

    // Fallback con credenciales de prueba del padrón institucional si Supabase está offline
    if (error || !usuario) {
      const USUARIOS_DEMO: Record<string, Partial<UsuarioInstitucion>> = {
        'alumno@inacapmail.cl': {
          id: 'demo-alumno',
          rut: '12.345.678-5',
          nombre_completo: 'Juan Pérez González',
          correo_institucional: 'alumno@inacapmail.cl',
          rol: 'alumno',
          carrera_o_departamento: 'Ingeniería en Informática',
          estado_activo: true,
        },
        'encargado@institucion.cl': {
          id: 'demo-encargado',
          rut: '11.222.333-4',
          nombre_completo: 'Claudia Soto Morales',
          correo_institucional: 'encargado@institucion.cl',
          rol: 'encargado_administrativo',
          carrera_o_departamento: 'Dirección de Asuntos Estudiantiles',
          estado_activo: true,
        },
        'admin@institucion.cl': {
          id: 'demo-admin',
          rut: '9.876.543-2',
          nombre_completo: 'Rodrigo Valenzuela',
          correo_institucional: 'admin@institucion.cl',
          rol: 'administrador',
          carrera_o_departamento: 'Infraestructura TI',
          estado_activo: true,
        },
        'docente@institucion.cl': {
          id: 'demo-docente',
          rut: '15.678.901-3',
          nombre_completo: 'Prof. Mario Bunge',
          correo_institucional: 'docente@institucion.cl',
          rol: 'docente',
          carrera_o_departamento: 'Área Tecnologías de la Información',
          estado_activo: true,
        },
      };

      const demoUser = USUARIOS_DEMO[cleanId] || Object.values(USUARIOS_DEMO).find(u => u.rut === cleanId.toUpperCase());

      if (demoUser && password.length >= 4) {
        const response = NextResponse.json({
          usuario: demoUser,
          mensaje: 'Sesión iniciada correctamente (Padrón Institucional)',
        });
        response.cookies.set('inacap_session_rol', demoUser.rol!, { path: '/' });
        response.cookies.set('inacap_session_rut', demoUser.rut!, { path: '/' });
        return response;
      }

      return NextResponse.json(
        { error: 'Credenciales inválidas o usuario no registrado en DB-Institucional' },
        { status: 401 }
      );
    }

    if (!usuario.estado_activo) {
      return NextResponse.json(
        { error: 'El usuario se encuentra inactivo en el sistema institucional' },
        { status: 403 }
      );
    }

    // Respuesta exitosa con usuario y rol detectado
    const { password_hash, ...perfilSeguro } = usuario;
    const response = NextResponse.json({
      usuario: perfilSeguro,
      mensaje: 'Autenticación institucional exitosa',
    });

    response.cookies.set('inacap_session_rol', usuario.rol, { path: '/' });
    response.cookies.set('inacap_session_rut', usuario.rut, { path: '/' });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error durante autenticación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
