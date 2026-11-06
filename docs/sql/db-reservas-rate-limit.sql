-- ==============================================================
-- DB-Reservas — Rate limiting compartido para el login
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto DB-Reservas)
-- ==============================================================
--
-- Objetivo:
--   * El contador de intentos fallidos deja de vivir en la memoria de
--     cada instancia y pasa a una tabla PostgreSQL compartida.
--   * Las operaciones son atómicas (RPC) para evitar condiciones de
--     carrera cuando llegan intentos concurrentes.
--   * La tabla guarda únicamente un hash SHA-256 de la clave, nunca el
--     correo ni el RUT en texto claro.
--   * Solo service_role puede leer/escribir la tabla y ejecutar las
--     funciones; anon/authenticated quedan sin acceso.
--
-- Este script es independiente de db-reservas-rls.sql, pero puede
-- ejecutarse después de él sin conflicto.
-- ==============================================================

begin;

-- 1. Tabla de contadores
create table if not exists public.intentos_login (
  clave text primary key,
  fallos integer not null default 0,
  ventana_inicio timestamptz not null default now(),
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz not null default now()
);

-- 2. RLS + privilegios: acceso exclusivo del servidor
alter table public.intentos_login enable row level security;
revoke all on public.intentos_login from anon, authenticated;
grant select, insert, update, delete on public.intentos_login to service_role;

-- Índice para la limpieza periódica de registros antiguos
create index if not exists intentos_login_actualizado_idx
  on public.intentos_login (actualizado_en);

-- 3. Verificar si una clave está bloqueada
create or replace function public.login_verificar_bloqueo(p_clave text)
returns table (bloqueado boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bloqueado_hasta timestamptz;
begin
  select i.bloqueado_hasta
    into v_bloqueado_hasta
  from public.intentos_login i
  where i.clave = p_clave;

  if v_bloqueado_hasta is not null and v_bloqueado_hasta > now() then
    return query
      select true,
             greatest(1, ceil(extract(epoch from (v_bloqueado_hasta - now())))::integer);
    return;
  end if;

  return query select false, 0;
end;
$$;

-- 4. Registrar un fallo de forma atómica y devolver si quedó bloqueada
create or replace function public.login_registrar_fallo(
  p_clave text,
  p_max_fallos integer default 5,
  p_ventana_segundos integer default 900,
  p_bloqueo_segundos integer default 900
)
returns table (bloqueado boolean, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fallos integer;
  v_inicio timestamptz;
  v_bloqueado_hasta timestamptz;
begin
  insert into public.intentos_login (clave)
  values (p_clave)
  on conflict (clave) do nothing;

  select i.fallos, i.ventana_inicio, i.bloqueado_hasta
    into v_fallos, v_inicio, v_bloqueado_hasta
  from public.intentos_login i
  where i.clave = p_clave
  for update;

  -- Si el bloqueo ya expiró, se reinicia el contador.
  if v_bloqueado_hasta is not null and v_bloqueado_hasta <= now() then
    v_fallos := 0;
    v_inicio := now();
    v_bloqueado_hasta := null;
  end if;

  -- Si la ventana de 15 minutos expiró, se reinicia el contador.
  if v_inicio < now() - make_interval(secs => p_ventana_segundos) then
    v_fallos := 0;
    v_inicio := now();
  end if;

  v_fallos := v_fallos + 1;

  if v_fallos >= p_max_fallos then
    v_bloqueado_hasta := now() + make_interval(secs => p_bloqueo_segundos);
  end if;

  update public.intentos_login
     set fallos = v_fallos,
         ventana_inicio = v_inicio,
         bloqueado_hasta = v_bloqueado_hasta,
         actualizado_en = now()
   where clave = p_clave;

  if v_bloqueado_hasta is not null and v_bloqueado_hasta > now() then
    return query
      select true,
             greatest(1, ceil(extract(epoch from (v_bloqueado_hasta - now())))::integer);
    return;
  end if;

  return query select false, 0;
end;
$$;

-- 5. Limpiar el contador tras un login exitoso
create or replace function public.login_limpiar_intentos(p_clave text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.intentos_login where clave = p_clave;
$$;

-- 6. Solo service_role puede ejecutar las funciones
revoke all on function public.login_verificar_bloqueo(text) from public, anon, authenticated;
revoke all on function public.login_registrar_fallo(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.login_limpiar_intentos(text) from public, anon, authenticated;

grant execute on function public.login_verificar_bloqueo(text) to service_role;
grant execute on function public.login_registrar_fallo(text, integer, integer, integer) to service_role;
grant execute on function public.login_limpiar_intentos(text) to service_role;

commit;

-- ==============================================================
-- Verificación
-- ==============================================================
-- 1. La tabla debe tener RLS activo:
--    select relname, relrowsecurity
--    from pg_class
--    where relname = 'intentos_login';
--
-- 2. La clave pública no debe poder ejecutar las funciones:
--    POST /rest/v1/rpc/login_verificar_bloqueo  -> 401/403
--
-- 3. Limpieza periódica recomendada (pg_cron o tarea programada):
--    delete from public.intentos_login
--     where actualizado_en < now() - interval '1 day'
--       and (bloqueado_hasta is null or bloqueado_hasta < now());
-- ==============================================================
