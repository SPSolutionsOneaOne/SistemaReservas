-- ==============================================================
-- DB-Institucional — Políticas RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto DB-Institucional)
-- ==============================================================
--
-- La tabla contiene hashes de contraseña y datos personales, por lo que
-- NINGUNA clave pública debe poder leerla ni escribirla. Todo el acceso
-- se realiza desde rutas API del servidor con la clave secreta.
-- ==============================================================

begin;

alter table public.usuarios_institucion enable row level security;

-- Sin políticas para anon/authenticated: RLS deniega todo por defecto.
-- Se revocan privilegios como defensa en profundidad.
revoke all on public.usuarios_institucion from anon, authenticated;

commit;

-- Verificación: con la clave publishable debe devolver 0 filas.
--   select rut, correo_institucional from public.usuarios_institucion;
