-- ============================================================
-- MIGRACIÓN: Índice único parcial de solape personal en reservas
-- Fecha: 2026-11-17
-- Ejecutar en: SQL Editor del proyecto Supabase "reservas" (DB-Reservas)
-- ============================================================
-- Contexto:
--   Existía un índice único parcial por (id_sala, fecha, bloque_horario)
--   que impide doble reserva de una misma sala en el mismo bloque.
--   Faltaba una restricción equivalente por usuario: un mismo alumno/
--   docente podía reservar dos recintos distintos en el mismo bloque
--   de la misma fecha.
--
--   Esta migración cierra la brecha también a nivel transaccional
--   (defensa en profundidad, además de la validación en la capa de
--   aplicación en crearReservaConValidacion).
--
-- Estados bloqueantes: cualquiera salvo 'cancelada' (borrado lógico).
-- Un registro 'no_asistio' también cuenta como ocupación histórica del
-- bloque; el bloqueo de bloque es definitivo una vez ejecutado.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_reservas_solape_personal_unico
  ON public.reservas (usuario_rut, fecha, bloque_horario)
  WHERE estado <> 'cancelada';

-- Nota: el índice parcial existente de sala se mantiene intacto:
--   CREATE UNIQUE INDEX ... ON public.reservas (id_sala, fecha, bloque_horario)
--   WHERE estado IN ('confirmada', 'completada');
