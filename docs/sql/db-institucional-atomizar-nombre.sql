-- ============================================================
-- DB-Institucional — nombre atomizado (4 campos)
-- ------------------------------------------------------------
-- Ejecutar en: Supabase (DB-Institucional) -> SQL Editor
--
-- Cambia el nombre completo como único dato a:
--   primer_nombre, segundo_nombre, apellido_paterno, apellido_materno
--
-- La columna `nombre_completo` se reemplaza por una columna generada:
-- concatena los campos atomizados para mantener compatibilidad con
-- llamadas existentes. El dato fuente normalizado está en las 4 columnas.
--
-- Importante: pregúntale al DBA/usuario antes si hay datos con formato
-- regional muy variable o varios apellidos compuestos. El split inicial
-- usa una heurística conservadora; se puede ajustar luego.
--
-- Es seguro de re-ejecutar (idempotente) salvo cambios manuales
-- posteriores a los campos atomizados.
-- ============================================================

begin;

-- 1. Nuevas columnas (nullable en primera fase)
alter table public.usuarios_institucion
  add column if not exists primer_nombre varchar(150),
  add column if not exists segundo_nombre varchar(150),
  add column if not exists apellido_paterno varchar(150),
  add column if not exists apellido_materno varchar(150);

-- 2. Población inicial desde nombre_completo
--    Reglas:
--    - 1 token  -> primer_nombre; apellido_paterno = 'ApellidoPendiente'
--    - 2 tokens -> primer = token1, paterno = token2
--    - 3 tokens -> primer = token1, paterno = token2, materno = token3
--    - 4+ tokens -> primer = token1, segundo = tokens 2..n-2 unidos,
--                   paterno = token n-1, materno = token n
do $$
declare
  r record;
  v_name text;
  v_tokens text[];
  v_n int;
  v_segundo text;
begin
  for r in
    select id, nombre_completo
    from public.usuarios_institucion
  loop
    v_name := btrim(regexp_replace(coalesce(r.nombre_completo, ''), '\s+', ' ', 'g'));
    v_tokens := regexp_split_to_array(v_name, '\s+');
    v_n := array_length(v_tokens, 1);

    if v_n is null or v_n = 0 then
      update public.usuarios_institucion
      set primer_nombre = 'NombrePendiente',
          segundo_nombre = null,
          apellido_paterno = 'ApellidoPendiente',
          apellido_materno = null
      where id = r.id;
    elsif v_n = 1 then
      update public.usuarios_institucion
      set primer_nombre = v_tokens[1],
          segundo_nombre = null,
          apellido_paterno = 'ApellidoPendiente',
          apellido_materno = null
      where id = r.id;
    elsif v_n = 2 then
      update public.usuarios_institucion
      set primer_nombre = v_tokens[1],
          segundo_nombre = null,
          apellido_paterno = v_tokens[2],
          apellido_materno = null
      where id = r.id;
    elsif v_n = 3 then
      update public.usuarios_institucion
      set primer_nombre = v_tokens[1],
          segundo_nombre = null,
          apellido_paterno = v_tokens[2],
          apellido_materno = v_tokens[3]
      where id = r.id;
    else
      v_segundo := array_to_string(v_tokens[2:v_n - 2], ' ');
      update public.usuarios_institucion
      set primer_nombre = v_tokens[1],
          segundo_nombre = nullif(v_segundo, ''),
          apellido_paterno = v_tokens[v_n - 1],
          apellido_materno = v_tokens[v_n]
      where id = r.id;
    end if;
  end loop;
end $$;

-- 3. Eliminar origen completo y reemplazarlo por una columna generada
--    (el nombre completo se conserva como dato derivado)
alter table public.usuarios_institucion
  drop column if exists nombre_completo;

alter table public.usuarios_institucion
  add column nombre_completo text
    generated always as (
      btrim(concat_ws(' ',
        primer_nombre,
        segundo_nombre,
        apellido_paterno,
        apellido_materno
      ))
    ) stored;

-- 4. Restricciones
alter table public.usuarios_institucion
  alter column primer_nombre set not null,
  alter column apellido_paterno set not null;

-- 5. Índice de búsqueda por paterno, útil para directorio/validación
create index if not exists usuarios_institucion_apellido_idx
  on public.usuarios_institucion (apellido_paterno, apellido_materno);

commit;

-- ============================================================
-- Verificación (opcional):
--
--   select rut, primer_nombre, segundo_nombre, apellido_paterno,
--          apellido_materno, nombre_completo
--   from public.usuarios_institucion
--   order by apellido_paterno, primer_nombre;
--
--   -- No debe haber split críticos pendientes
--   select * from public.usuarios_institucion
--   where apellido_paterno = 'ApellidoPendiente';
-- ============================================================
