// ============================================================
// Controlador: reservasController
// Lógica de negocio server-side para la gestión de reservas
// ============================================================

import type {
  Reserva,
  ReservaInsert,
  ReservaUpdate,
  Sala,
  HistorialPenalizacion,
  HistorialPenalizacionUpdate,
  BitacoraAdministrativaInsert,
} from '@/types/database';
import {
  MAX_AUSENCIAS_ANTES_BLOQUEO,
  DIAS_BLOQUEO_PENALIZACION,
} from '@/types/database';
import { getSupabaseReservas } from '@/lib/supabaseReservas';
import { getSupabaseInstitucional } from '@/lib/supabaseInstitucional';
import {
  validarRutChileno,
  validarBloqueHorario,
  validarAforo,
  generarCodigoReserva,
  validarCorreoInstitucional,
} from '@/lib/validators';
import { notificadorGlobal } from '@/services/NotificadorICS';

// ---- Validar 100% Asistentes Institucionales (RN04 / RF-FUN-07) ----

export async function validarAsistentesInstitucionales(
  ruts: string[]
): Promise<{ validos: boolean; invalidos: string[]; error?: string }> {
  if (!ruts || ruts.length === 0) {
    return { validos: true, invalidos: [] };
  }

  const supabaseInstitucional = getSupabaseInstitucional();
  const invalidos: string[] = [];

  for (const rut of ruts) {
    if (!validarRutChileno(rut)) {
      invalidos.push(`${rut} (Formato de RUT no válido)`);
      continue;
    }

    const { data: usuario, error } = await supabaseInstitucional
      .from('usuarios_institucion')
      .select('rut, correo_institucional, estado_activo')
      .eq('rut', rut)
      .single();

    if (error || !usuario) {
      invalidos.push(`${rut} (No registrado en DB-Institucional)`);
      continue;
    }

    if (!usuario.estado_activo) {
      invalidos.push(`${rut} (Usuario institucional inactivo)`);
      continue;
    }

    if (!validarCorreoInstitucional(usuario.correo_institucional)) {
      invalidos.push(`${rut} (Correo no pertenece a @institucion.cl / @inacapmail.cl - RN04)`);
    }
  }

  if (invalidos.length > 0) {
    return {
      validos: false,
      invalidos,
      error: `Asistentes no autorizados (RN04): ${invalidos.join(', ')}`,
    };
  }

  return { validos: true, invalidos: [] };
}

// ---- Reservas: Creación ----

export async function crearReservaConValidacion(
  params: Omit<ReservaInsert, 'codigo_reserva'>,
  asistentesRuts: string[] = [],
  encargadoRut?: string // Si un administrativo reserva a nombre de un estudiante
): Promise<{ exito: boolean; reserva?: Reserva; error?: string; httpCode?: number }> {
  const supabaseReservas = getSupabaseReservas();
  const supabaseInstitucional = getSupabaseInstitucional();

  // 1. Validar RUT del titular
  if (!validarRutChileno(params.usuario_rut)) {
    return { exito: false, error: 'Formato de RUT del titular inválido', httpCode: 400 };
  }

  // 2. Validar bloque horario (0 - 13)
  if (!validarBloqueHorario(params.bloque_horario)) {
    return { exito: false, error: 'Bloque horario debe estar entre 0 y 13', httpCode: 400 };
  }

  // 3. Verificar existencia del usuario titular en padrón institucional
  const { data: usuario, error: errUsuario } = await supabaseInstitucional
    .from('usuarios_institucion')
    .select('rut, nombre_completo, correo_institucional, estado_activo, rol')
    .eq('rut', params.usuario_rut)
    .single();

  if (errUsuario || !usuario) {
    return { exito: false, error: 'Usuario titular no encontrado en el padrón institucional', httpCode: 404 };
  }

  if (!usuario.estado_activo) {
    return { exito: false, error: 'Usuario titular desactivado institucionalmente', httpCode: 403 };
  }

  // 4. Validar que el 100% de los asistentes pertenezcan a la institución (RN04 / RF-FUN-07)
  if (asistentesRuts.length > 0) {
    const valAsistentes = await validarAsistentesInstitucionales(asistentesRuts);
    if (!valAsistentes.validos) {
      return { exito: false, error: valAsistentes.error, httpCode: 422 };
    }
  }

  // 5. Verificar penalizaciones en DB-Reservas
  const { data: penal } = await supabaseReservas
    .from('historial_penalizaciones')
    .select('*')
    .eq('usuario_rut', params.usuario_rut)
    .single();

  if (penal) {
    const p = penal as HistorialPenalizacion;
    if (p.bloqueado_hasta && new Date() < new Date(p.bloqueado_hasta)) {
      return {
        exito: false,
        error: `El estudiante se encuentra bloqueado hasta ${new Date(p.bloqueado_hasta).toLocaleDateString('es-CL')} por acumulación de ${p.ausencias_acumuladas} ausencias.`,
        httpCode: 403,
      };
    }
  }

  // 6. Verificar sala: existencia, estado y aforo
  const { data: sala, error: errSala } = await supabaseReservas
    .from('salas')
    .select('*')
    .eq('id_sala', params.id_sala)
    .single();

  if (errSala || !sala) {
    return { exito: false, error: 'Sala no encontrada', httpCode: 404 };
  }

  const salaData = sala as Sala;

  if (salaData.estado_habilitacion !== 'activo') {
    return {
      exito: false,
      error: `Sala en estado '${salaData.estado_habilitacion}' — no disponible para reservas`,
      httpCode: 422,
    };
  }

  if (!validarAforo(params.cantidad_asistentes, salaData.aforo)) {
    return {
      exito: false,
      error: `Cantidad de asistentes (${params.cantidad_asistentes}) excede el aforo permitido de la sala (${salaData.aforo})`,
      httpCode: 422,
    };
  }

  // 7. Generar código de reserva secuencial
  const { count } = await supabaseReservas
    .from('reservas')
    .select('*', { count: 'exact', head: true });

  const codigoReserva = generarCodigoReserva((count ?? 0) + 1);

  // 8. Insertar reserva (Restricción UNIQUE(id_sala, fecha, bloque_horario) -> 409 si solape)
  const reservaInsert: ReservaInsert = {
    ...params,
    codigo_reserva: codigoReserva,
  };

  const { data: nuevaReserva, error: errInsert } = await supabaseReservas
    .from('reservas')
    .insert(reservaInsert)
    .select()
    .single();

  if (errInsert) {
    if (errInsert.code === '23505') {
      return {
        exito: false,
        error: 'Conflicto de concurrencia: este bloque horario ya ha sido reservado para esta sala y fecha (HTTP 409)',
        httpCode: 409,
      };
    }
    return { exito: false, error: errInsert.message, httpCode: 500 };
  }

  const reservaFinal = nuevaReserva as Reserva;

  // 9. Si fue gestionada por un Encargado Administrativo para un tercero (RF-SEC-04), auditar
  if (encargadoRut) {
    await registrarBitacora({
      encargado_rut: encargadoRut,
      accion: `Reserva asistida creada para sala ${params.id_sala}, fecha ${params.fecha}, bloque ${params.bloque_horario}. Código: ${codigoReserva}`,
      rut_estudiante_afectado: params.usuario_rut,
    });
  }

  // 10. Disparar Patrón Observer para despacho asíncrono y archivo .ics (RF-PER-08)
  try {
    await notificadorGlobal.notificar({
      reserva: reservaFinal,
      sala: salaData,
      correoTitular: usuario.correo_institucional,
      nombreTitular: usuario.nombre_completo,
      correosAsistentes: [],
    });
  } catch (err) {
    console.warn('[Observer NotificadorICS] Despacho diferido:', err);
  }

  return { exito: true, reserva: reservaFinal };
}

// ---- Reservas: Edición / Reprogramación (RF-FUN-02) ----

export async function editarReservaConValidacion(
  idReserva: string,
  datos: {
    fecha?: string;
    bloque_horario?: number;
    cantidad_asistentes?: number;
    proposito?: string;
  }
): Promise<{ exito: boolean; reserva?: Reserva; error?: string; httpCode?: number }> {
  const supabaseReservas = getSupabaseReservas();

  // 1. Obtener reserva actual
  const { data: reservaActual, error: errGet } = await supabaseReservas
    .from('reservas')
    .select('*')
    .eq('id_reserva', idReserva)
    .single();

  if (errGet || !reservaActual) {
    return { exito: false, error: 'Reserva no encontrada', httpCode: 404 };
  }

  if (reservaActual.estado !== 'confirmada') {
    return {
      exito: false,
      error: `No se puede editar una reserva en estado '${reservaActual.estado}'`,
      httpCode: 422,
    };
  }

  // 2. Validar bloque horario si cambia
  if (datos.bloque_horario !== undefined && !validarBloqueHorario(datos.bloque_horario)) {
    return { exito: false, error: 'Bloque horario debe estar entre 0 y 13', httpCode: 400 };
  }

  // 3. Validar aforo si cambia cantidad
  if (datos.cantidad_asistentes !== undefined) {
    const { data: sala } = await supabaseReservas
      .from('salas')
      .select('aforo')
      .eq('id_sala', reservaActual.id_sala)
      .single();

    if (sala && !validarAforo(datos.cantidad_asistentes, sala.aforo)) {
      return {
        exito: false,
        error: `Cantidad de asistentes (${datos.cantidad_asistentes}) excede el aforo de la sala (${sala.aforo})`,
        httpCode: 422,
      };
    }
  }

  // 4. Actualizar datos en DB
  const updatePayload: ReservaUpdate = {};
  if (datos.fecha) updatePayload.fecha = datos.fecha;
  if (datos.bloque_horario !== undefined) updatePayload.bloque_horario = datos.bloque_horario;
  if (datos.cantidad_asistentes !== undefined) updatePayload.cantidad_asistentes = datos.cantidad_asistentes;
  if (datos.proposito) updatePayload.proposito = datos.proposito;

  const { data: actualizada, error: errUpdate } = await supabaseReservas
    .from('reservas')
    .update(updatePayload)
    .eq('id_reserva', idReserva)
    .select()
    .single();

  if (errUpdate) {
    if (errUpdate.code === '23505') {
      return {
        exito: false,
        error: 'Conflicto de horario: la nueva fecha/bloque ya está ocupada por otra reserva (HTTP 409)',
        httpCode: 409,
      };
    }
    return { exito: false, error: errUpdate.message, httpCode: 500 };
  }

  return { exito: true, reserva: actualizada as Reserva };
}

// ---- Motor de Penalización ----

export async function procesarAusencia(
  usuarioRut: string
): Promise<{ bloqueado: boolean; ausencias: number }> {
  const supabase = getSupabaseReservas();

  const { data: existente } = await supabase
    .from('historial_penalizaciones')
    .select('*')
    .eq('usuario_rut', usuarioRut)
    .single();

  let ausencias = 1;

  if (existente) {
    const penal = existente as HistorialPenalizacion;
    ausencias = penal.ausencias_acumuladas + 1;

    const update: HistorialPenalizacionUpdate = {
      ausencias_acumuladas: ausencias,
      ultima_actualizacion: new Date().toISOString(),
    };

    if (ausencias >= MAX_AUSENCIAS_ANTES_BLOQUEO) {
      const bloqueadoHasta = new Date();
      bloqueadoHasta.setDate(bloqueadoHasta.getDate() + DIAS_BLOQUEO_PENALIZACION);
      update.bloqueado_hasta = bloqueadoHasta.toISOString();
    }

    await supabase
      .from('historial_penalizaciones')
      .update(update)
      .eq('id', penal.id);
  } else {
    await supabase.from('historial_penalizaciones').insert({
      usuario_rut: usuarioRut,
      ausencias_acumuladas: 1,
    });
  }

  return {
    bloqueado: ausencias >= MAX_AUSENCIAS_ANTES_BLOQUEO,
    ausencias,
  };
}

export async function resetearAusencias(usuarioRut: string): Promise<void> {
  const supabase = getSupabaseReservas();

  await supabase
    .from('historial_penalizaciones')
    .update({
      ausencias_acumuladas: 0,
      bloqueado_hasta: null,
      ultima_actualizacion: new Date().toISOString(),
    } satisfies HistorialPenalizacionUpdate)
    .eq('usuario_rut', usuarioRut);
}

// ---- Bitácora Administrativa (RF-SEC-04) ----

export async function registrarBitacora(
  entrada: BitacoraAdministrativaInsert
): Promise<void> {
  const supabase = getSupabaseReservas();

  const { error } = await supabase
    .from('bitacora_administrativa')
    .insert(entrada);

  if (error) {
    console.error(`[Bitácora] Error al registrar auditoría: ${error.message}`);
  }
}
