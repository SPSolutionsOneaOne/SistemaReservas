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
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';
import { getSupabaseInstitucionalAdmin } from '@/lib/supabaseInstitucionalAdmin';
import {
  validarRutChileno,
  validarBloqueHorario,
  validarAforo,
  validarFechaMesEnCurso,
  generarCodigoReserva,
  validarCorreoInstitucional,
} from '@/lib/validators';
import { notificadorGlobal } from '@/services/NotificadorICS';
import { ahoraSantiago, vencidaGracia } from '@/lib/horarios';

// ---- Validar 100% Asistentes Institucionales (RN04 / RF-FUN-07) ----

export async function validarAsistentesInstitucionales(
  ruts: string[]
): Promise<{ validos: boolean; invalidos: string[]; error?: string }> {
  if (!ruts || ruts.length === 0) {
    return { validos: true, invalidos: [] };
  }

  const supabaseInstitucional = getSupabaseInstitucionalAdmin();
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
      invalidos.push(`${rut} (No registrado en el padrón institucional)`);
      continue;
    }

    if (!usuario.estado_activo) {
      invalidos.push(`${rut} (Usuario institucional inactivo)`);
      continue;
    }

    if (!validarCorreoInstitucional(usuario.correo_institucional)) {
      invalidos.push(`${rut} (Correo no pertenece a un dominio institucional válido)`);
    }
  }

  if (invalidos.length > 0) {
    return {
      validos: false,
      invalidos,
      error: `Asistentes no autorizados: ${invalidos.join(', ')}`,
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
  const supabaseReservas = getSupabaseReservasAdmin();
  const supabaseInstitucional = getSupabaseInstitucionalAdmin();

  // 1. Validar RUT del titular
  if (!validarRutChileno(params.usuario_rut)) {
    return { exito: false, error: 'Formato de RUT del titular inválido', httpCode: 400 };
  }

  // 2. Validar bloque horario (0 - 13)
  if (!validarBloqueHorario(params.bloque_horario)) {
    return { exito: false, error: 'Bloque horario debe estar entre 0 y 13', httpCode: 400 };
  }

  // 2b. La fecha debe estar dentro del mes en curso
  if (!validarFechaMesEnCurso(params.fecha)) {
    return {
      exito: false,
      error: 'La fecha debe estar dentro del mes en curso',
      httpCode: 422,
    };
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
    console.error('[reservas POST] Error al insertar reserva:', errInsert);
    return { exito: false, error: 'Error interno al crear la reserva', httpCode: 500 };
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
  const supabaseReservas = getSupabaseReservasAdmin();

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

  if (reservaActual.asistencia_registrada_en) {
    return {
      exito: false,
      error: 'No se puede editar una reserva con asistencia registrada',
      httpCode: 422,
    };
  }

  // 2. Validar bloque horario si cambia
  if (datos.bloque_horario !== undefined && !validarBloqueHorario(datos.bloque_horario)) {
    return { exito: false, error: 'Bloque horario debe estar entre 0 y 13', httpCode: 400 };
  }

  // 2b. La fecha debe estar dentro del mes en curso
  if (datos.fecha !== undefined && !validarFechaMesEnCurso(datos.fecha)) {
    return {
      exito: false,
      error: 'La fecha debe estar dentro del mes en curso',
      httpCode: 422,
    };
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
    console.error('[reservas PATCH] Error al actualizar reserva:', errUpdate);
    return { exito: false, error: 'Error interno al editar la reserva', httpCode: 500 };
  }

  return { exito: true, reserva: actualizada as Reserva };
}

// ---- Reservas: Eliminación (DELETE físico) ----

/**
 * Elimina físicamente la reserva: libera el bloque al instante (compatible
 * con la restricción UNIQUE(id_sala, fecha, bloque_horario)).
 * Reglas: solo el titular o un rol staff; solo reservas confirmadas y sin
 * asistencia registrada. Si un staff elimina la reserva de un tercero,
 * queda auditada en bitácora (RF-SEC-04).
 */
export async function eliminarReservaConValidacion(
  idReserva: string,
  actorRut: string,
  esStaff: boolean
): Promise<{ exito: boolean; reserva?: Reserva; error?: string; httpCode?: number }> {
  const supabaseReservas = getSupabaseReservasAdmin();

  // 1. Obtener reserva actual
  const { data: reservaActual, error: errGet } = await supabaseReservas
    .from('reservas')
    .select('*')
    .eq('id_reserva', idReserva)
    .single();

  if (errGet || !reservaActual) {
    return { exito: false, error: 'Reserva no encontrada', httpCode: 404 };
  }

  // 2. Titularidad: solo el dueño o un rol staff
  if (!esStaff && reservaActual.usuario_rut !== actorRut) {
    return { exito: false, error: 'No autorizado para eliminar esta reserva', httpCode: 403 };
  }

  if (reservaActual.estado !== 'confirmada') {
    return {
      exito: false,
      error: `No se puede eliminar una reserva en estado '${reservaActual.estado}'`,
      httpCode: 422,
    };
  }

  if (reservaActual.asistencia_registrada_en) {
    return {
      exito: false,
      error: 'No se puede eliminar una reserva con asistencia registrada',
      httpCode: 422,
    };
  }

  // 3. Eliminar físicamente
  const { error: errDelete } = await supabaseReservas
    .from('reservas')
    .delete()
    .eq('id_reserva', idReserva);

  if (errDelete) {
    console.error('[reservas DELETE] Error al eliminar reserva:', errDelete);
    return { exito: false, error: 'Error interno al eliminar la reserva', httpCode: 500 };
  }

  // 4. Auditoría si un staff elimina la reserva de un tercero (RF-SEC-04)
  if (esStaff && reservaActual.usuario_rut !== actorRut) {
    await registrarBitacora({
      encargado_rut: actorRut,
      accion: `Reserva eliminada: sala ${reservaActual.id_sala}, fecha ${reservaActual.fecha}, bloque ${reservaActual.bloque_horario}. Código: ${reservaActual.codigo_reserva}`,
      rut_estudiante_afectado: reservaActual.usuario_rut,
    });
  }

  return { exito: true, reserva: reservaActual as Reserva };
}

// ---- Motor de Penalización ----

export async function procesarAusencia(
  usuarioRut: string
): Promise<{ bloqueado: boolean; ausencias: number }> {
  const supabase = getSupabaseReservasAdmin();

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
  const supabase = getSupabaseReservasAdmin();

  await supabase
    .from('historial_penalizaciones')
    .update({
      ausencias_acumuladas: 0,
      bloqueado_hasta: null,
      ultima_actualizacion: new Date().toISOString(),
    } satisfies HistorialPenalizacionUpdate)
    .eq('usuario_rut', usuarioRut);
}

/**
 * Barrido automático de inasistencias (lo invoca el cron de Vercel).
 *
 * Marca como 'no_asistio' las reservas confirmadas cuya gracia de check-in
 * (inicio del bloque + MINUTOS_GRACIA_CHECKIN) ya venció sin asistencia.
 * Cada inasistencia cuenta 1 ausencia vía procesarAusencia(), salvo para
 * el personal administrativo (encargado/administrador), exento de
 * penalización. Es idempotente: solo procesa filas aún 'confirmada' y
 * solo cuenta la ausencia si THIS run ganó la actualización.
 */
export async function procesarInasistencias(): Promise<{
  procesadas: number;
  bloqueados: number;
  exentosStaff: number;
}> {
  const supabaseReservas = getSupabaseReservasAdmin();
  const supabaseInstitucional = getSupabaseInstitucionalAdmin();
  const pared = ahoraSantiago();

  // Candidatas: confirmadas, sin asistencia, fecha ya iniciada o pasada.
  // El limit aleatorio cambia la URL en cada corrida: la capa de red de
  // Supabase cachea respuestas GET por URL exacta y devolvía listas
  // vencidas (doble conteo). Sin esto, el barrido veía filas ya procesadas.
  const limite = 10000 + Math.floor(Math.random() * 1000);
  const { data: candidatas, error } = await supabaseReservas
    .from('reservas')
    .select('id_reserva, usuario_rut, fecha, bloque_horario')
    .eq('estado', 'confirmada')
    .is('asistencia_registrada_en', null)
    .lte('fecha', pared.fecha)
    .limit(limite);

  if (error) {
    console.error('[Motor ausencia] Error al listar candidatas:', error);
    return { procesadas: 0, bloqueados: 0, exentosStaff: 0 };
  }

  const vencidas = (candidatas ?? []).filter((r) =>
    vencidaGracia(r.fecha, r.bloque_horario, pared)
  );

  console.log(
    '[Motor ausencia] candidatas:',
    (candidatas ?? []).length,
    'vencidas:',
    vencidas.length
  );

  if (vencidas.length === 0) {
    return { procesadas: 0, bloqueados: 0, exentosStaff: 0 };
  }

  // Roles de los titulares afectados (una sola consulta indexada).
  const ruts = Array.from(new Set(vencidas.map((r) => r.usuario_rut)));
  const { data: usuarios } = await supabaseInstitucional
    .from('usuarios_institucion')
    .select('rut, rol')
    .in('rut', ruts);

  const rolPorRut = new Map(
    (usuarios ?? []).map((u) => [u.rut as string, u.rol as string])
  );

  let procesadas = 0;
  let bloqueados = 0;
  let exentosStaff = 0;

  for (const r of vencidas) {
    // Marca no_asistio solo si sigue confirmada (evita doble conteo
    // si dos barridos concurrentes procesan la misma fila).
    const { data: marcadas, error: errUpdate } = await supabaseReservas
      .from('reservas')
      .update({ estado: 'no_asistio' })
      .eq('id_reserva', r.id_reserva)
      .eq('estado', 'confirmada')
      .select('id_reserva');

    if (errUpdate || !marcadas || marcadas.length === 0) {
      console.log(
        '[Motor ausencia] skip',
        r.id_reserva,
        'errUpdate:',
        errUpdate ? errUpdate.code : 'null',
        'marcadas:',
        marcadas ? marcadas.length : 'null'
      );
      continue;
    }

    console.log('[Motor ausencia] marcada', r.id_reserva, 'marcadas:', marcadas.length);
    procesadas++;

    const rol = rolPorRut.get(r.usuario_rut);
    if (rol === 'encargado_administrativo' || rol === 'administrador') {
      exentosStaff++;
      continue;
    }

    const resultado = await procesarAusencia(r.usuario_rut);
    if (resultado.bloqueado) bloqueados++;
  }

  return { procesadas, bloqueados, exentosStaff };
}

// ---- Bitácora Administrativa (RF-SEC-04) ----

export async function registrarBitacora(
  entrada: BitacoraAdministrativaInsert
): Promise<void> {
  const supabase = getSupabaseReservasAdmin();

  const { error } = await supabase
    .from('bitacora_administrativa')
    .insert(entrada);

  if (error) {
    console.error(`[Bitácora] Error al registrar auditoría: ${error.message}`);
  }
}
