-- ==============================================================
-- Migración: catálogo dinámico de tipos de sala (tipos_sala)
-- Ejecutar UNA vez en el SQL Editor de Supabase (DB-Reservas).
-- ==============================================================
-- Efecto:
--   1. Crea public.tipos_sala (id, nombre, prefijo, aforo_sugerido,
--      color, orden, creado_en) con UNIQUE en nombre/prefijo.
--   2. Siembra los 5 tipos por defecto (lab, sala, aud, conf, bib).
--   3. Elimina el CHECK fijo de salas.tipo (si existía) para permitir
--      tipos nuevos.
--   4. Convierte salas.tipo en FK -> tipos_sala(id) ON UPDATE CASCADE
--      ON DELETE RESTRICT (un tipo en uso no puede borrarse).
--   5. Índice por salas.tipo (validación/joins).
-- ==============================================================

begin;

create table if not exists public.tipos_sala (
  id              text primary key check (id ~ '^[a-z0-9_]{2,20}$'),
  nombre          text not null unique,
  prefijo         text not null unique check (prefijo ~ '^[A-Z]{2,5}$'),
  aforo_sugerido  integer not null default 30 check (aforo_sugerido > 0),
  color           text not null default '#5B9BD5',
  orden           integer not null default 0,
  creado_en       timestamptz not null default now()
);

insert into public.tipos_sala (id, nombre, prefijo, aforo_sugerido, color, orden) values
  ('lab',  'Laboratorio',    'LAB', 30,  '#2563EB', 1),
  ('sala', 'Sala de clases', 'SAL', 35,  '#0D9488', 2),
  ('aud',  'Auditorio',      'AUD', 100, '#C2410C', 3),
  ('conf', 'Reuniones',      'CON', 12,  '#7C3AED', 4),
  ('bib',  'Biblioteca',     'BIB', 6,   '#BE185D', 5)
on conflict (id) do nothing;

-- Eliminar el CHECK fijo de salas.tipo si existe (lista in-place de los 5 tipos).
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.salas'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.salas drop constraint %I', cname);
  end loop;
end $$;

-- FK al catálogo; cascade solo para slugs, restrict para el borrado.
alter table public.salas drop constraint if exists salas_tipo_fkey;
alter table public.salas
  add constraint salas_tipo_fkey
  foreign key (tipo) references public.tipos_sala(id)
  on update cascade
  on delete restrict;

create index if not exists idx_salas_tipo on public.salas(tipo);

commit;

-- Verificación rápida (opcional):
--   select * from public.tipos_sala order by orden;
--   select conname from pg_constraint where conrelid = 'public.salas'::regclass;
