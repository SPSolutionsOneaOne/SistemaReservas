-- ============================================================
-- Bloques de 30 minutos (horarios del cliente)
-- ------------------------------------------------------------
-- Ejecutar en: Supabase (DB-Reservas) -> SQL Editor
--
-- Los bloques pasan de 14 x 45 min (08:00-18:30) a 27 x 30 min:
--   * lunes a viernes 08:30-22:00 (bloques 0-26)
--   * sábado 08:30-14:00 (bloques 0-10)
-- La regla por día (sábado/domingo) la valida el servidor; aquí solo
-- se amplía el CHECK de rango (0-13 -> 0-26).
--
-- NOTA: el significado del bloque (índice) cambia: una reserva antigua
-- con bloque 13 significaba 17:45-18:30 y ahora significa 15:00-15:30.
-- En fase pre-piloto solo hay datos de prueba; esta reinterpretación
-- es aceptada.
--
-- Es seguro de re-ejecutar (idempotente).
-- ============================================================

do $$
declare
  r record;
begin
  -- Eliminan los CHECK que mencionan bloque_horario o el rango 0-13
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservas'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%bloque_horario%'
           or pg_get_constraintdef(oid) ilike '%0-13%')
  loop
    execute 'alter table public.reservas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.reservas
  add constraint reservas_bloque_horario_check
  check (bloque_horario between 0 and 26);

-- ============================================================
-- Verificación (opcional):
--
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.reservas'::regclass
--     and conname = 'reservas_bloque_horario_check';
-- ============================================================
