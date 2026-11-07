-- ============================================================
-- Motor de penalizaciones por inasistencia — DB-Reservas
-- ------------------------------------------------------------
-- Ejecutar en: Supabase (DB-Reservas) -> SQL Editor
--
-- Cambios:
--   1. El estado 'no_asistio' pasa a ser válido en public.reservas.
--   2. La unicidad (id_sala, fecha, bloque_horario) pasa a ser parcial:
--      solo confirmada/completada bloquean el hueco. Una inasistencia
--      ('no_asistio') libera el resto del bloque para ser reservado.
--   3. Índice de apoyo para el barrido automático (cron cada 10 min).
--
-- Es seguro de re-ejecutar (idempotente).
-- ============================================================

-- 1. Amplía el CHECK de estado con 'no_asistio'
--    (se eliminan primero los CHECK que mencionen 'completada', sin
--    depender del nombre exacto de la restricción)
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%completada%'
  loop
    execute 'alter table public.reservas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.reservas
  add constraint reservas_estado_check
  check (estado in ('confirmada', 'cancelada', 'completada', 'no_asistio'));

-- 2. Unicidad parcial: solo las reservas vivas bloquean el hueco
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.reservas'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%id_sala%'
  loop
    execute 'alter table public.reservas drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

drop index if exists public.reservas_id_sala_fecha_bloque_horario_key;

create unique index if not exists reservas_bloque_libre_idx
  on public.reservas (id_sala, fecha, bloque_horario)
  where estado in ('confirmada', 'completada');

-- 3. Índice para el barrido automático del motor (cron)
create index if not exists reservas_sweep_idx
  on public.reservas (fecha)
  where estado = 'confirmada';

-- ============================================================
-- Verificación (opcional):
--
--   -- Debe devolver 1 fila: la restricción de estado incluye 'no_asistio'
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.reservas'::regclass and contype = 'c' and conname = 'reservas_estado_check';
--
--   -- Debe devolver 1 fila: unicidad parcial
--   select indexname, indexdef
--   from pg_indexes
--   where tablename = 'reservas' and indexname = 'reservas_bloque_libre_idx';
-- ============================================================
