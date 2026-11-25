-- ============================================================
-- MIGRACIÓN: revocación de sesiones (logout · FA1-015)
-- Ejecutar en SQL Editor — DB-Reservas
-- ============================================================
create table if not exists public.sesiones_revocadas (
  jti text primary key,
  usuario_rut varchar(12) not null,
  revocado_en timestamptz not null default now()
);

create index if not exists idx_sesiones_revocadas_rut
  on public.sesiones_revocadas (usuario_rut);

alter table public.sesiones_revocadas enable row level security;
