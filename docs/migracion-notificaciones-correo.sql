-- ============================================================
-- MIGRACIÓN: registro de notificaciones por correo (RF-PER-08)
-- Ejecutar en SQL Editor de Supabase — DB-Reservas
-- ============================================================

create table if not exists public.notificaciones_correo (
  id                 uuid primary key default uuid_generate_v4(),
  id_reserva         uuid not null references public.reservas(id_reserva) on delete cascade,
  codigo_reserva     varchar(20) not null,
  destinatario       varchar(150) not null,
  asunto             varchar(200) not null,
  estado             varchar(20) not null default 'pendiente'
                     check (estado in ('pendiente','enviado','fallido')),
  proveedor          varchar(30) not null default 'resend',
  error_mensaje      text,
  creado_en          timestamptz not null default now()
);

create index if not exists idx_notificaciones_reserva
  on public.notificaciones_correo (id_reserva);
create index if not exists idx_notificaciones_estado
  on public.notificaciones_correo (estado, creado_en desc);

-- RLS: sólo service_role (la app) puede leer/escribir; anon sin acceso.
alter table public.notificaciones_correo enable row level security;
