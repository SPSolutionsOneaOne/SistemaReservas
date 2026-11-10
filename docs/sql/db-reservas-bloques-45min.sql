-- ============================================================
-- Bloques de 45 minutos (horarios del cliente — corrección oficial)
-- ------------------------------------------------------------
-- Ejecutar en: Supabase (DB-Reservas) -> SQL Editor
--
-- Deben usarse bloques de 45 minutos:
--   * lunes a viernes 08:30-22:00 (bloques 0-17)
--   * sábado 08:30-13:45 (bloques 0-6)
--   * domingo: sin servicio
--
-- Este script ajusta el CHECK DB al rango 0-17. El comportamiento
-- por día y la franja de eliminación de salas están en el código.
--
-- IMPORTANTE: si ya hay reservas guardadas con bloque > 17 (de la
-- fase de 30 minutos), el script fallará al intentar crear el nuevo
-- CHECK hasta que esas reservas se eliminen o editen.
--
-- Es seguro de re-ejecutar (idempotente).
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservas'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%bloque_horario%'
           or pg_get_constraintdef(oid) ilike '%0-26%'
           or pg_get_constraintdef(oid) ilike '%0-13%')
  loop
    execute 'alter table public.reservas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.reservas
  add constraint reservas_bloque_horario_check
  check (bloque_horario between 0 and 17);

-- ============================================================
-- Verificación:
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.reservas'::regclass
--     and conname = 'reservas_bloque_horario_check';
-- ============================================================
