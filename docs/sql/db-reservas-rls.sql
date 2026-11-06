-- ==============================================================
-- DB-Reservas — Políticas RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto DB-Reservas)
-- ==============================================================
--
-- Objetivo:
--   * El catálogo de salas puede leerse con clave pública (no contiene PII).
--   * Las reservas, penalizaciones y bitácora NO se exponen a claves públicas:
--     contienen RUT, propósito y datos de auditoría.
--   * Las escrituras y la lectura de datos sensibles pasan por las rutas API
--     de Next.js, que usan la clave secreta (service_role) y omiten RLS.
-- ==============================================================

begin;

-- 1. Habilitar RLS en todas las tablas
alter table public.salas enable row level security;
alter table public.reservas enable row level security;
alter table public.historial_penalizaciones enable row level security;
alter table public.bitacora_administrativa enable row level security;

-- 2. Retirar privilegios públicos por defecto (defensa en profundidad)
revoke all on public.salas from anon, authenticated;
revoke all on public.reservas from anon, authenticated;
revoke all on public.historial_penalizaciones from anon, authenticated;
revoke all on public.bitacora_administrativa from anon, authenticated;

-- 3. Lectura pública únicamente del catálogo de salas
grant select on public.salas to anon, authenticated;

drop policy if exists salas_select_publico on public.salas;
create policy salas_select_publico
  on public.salas
  for select
  to anon, authenticated
  using (true);

-- 4. Reservas: sin políticas para anon/authenticated.
--    RLS deniega por defecto; la aplicación las consulta desde el servidor.
--    Si alguna vez se ejecutó una política pública anterior, se elimina.
drop policy if exists reservas_select_publico on public.reservas;

-- 5. Tablas sensibles: acceso exclusivo del servidor (service_role)
--    No se crean políticas para anon/authenticated.

commit;

-- Verificación:
--   Con la clave publishable:
--     select * from public.salas;                    -- permitido (catálogo)
--     select * from public.reservas;                 -- 0 filas / permiso denegado
--     select * from public.historial_penalizaciones; -- 0 filas / permiso denegado
--     select * from public.bitacora_administrativa;  -- 0 filas / permiso denegado
--   Con la clave service_role (servidor): todas las operaciones siguen funcionando.
