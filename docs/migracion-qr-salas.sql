-- ==============================================================
-- Migración: módulos QR y códigos manuales por sala
-- Ejecutar UNA vez en el SQL Editor de Supabase (DB-Reservas).
-- Aditiva e idempotente: no toca datos existentes; solo agrega
-- dos columnas a public.salas y las rellena con valores únicos.
-- ==============================================================

begin;

alter table public.salas
  add column if not exists qr_token text,
  add column if not exists codigo_manual text;

-- Token QR aleatorio (12 hex, mayúsculas) si falta
update public.salas
set qr_token = upper(substr(md5(random()::text || clock_timestamp()::text || id_sala), 1, 12))
where qr_token is null;

-- Código manual de 6 dígitos único por sala
do $$
declare
  r record;
  intento int;
  candidato text;
begin
  for r in select id_sala from public.salas loop
    if (select codigo_manual from public.salas where id_sala = r.id_sala) is not null then
      continue;
    end if;

    intento := 0;
    loop
      candidato := lpad(floor(random() * 1000000)::text, 6, '0');
      exit when not exists (select 1 from public.salas where codigo_manual = candidato);
      intento := intento + 1;
      if intento > 100 then
        raise exception 'No se pudo generar un código manual único para %', r.id_sala;
      end if;
    end loop;

    update public.salas set codigo_manual = candidato where id_sala = r.id_sala;
  end loop;
end $$;

alter table public.salas alter column qr_token set not null;
alter table public.salas alter column codigo_manual set not null;

create unique index if not exists salas_qr_token_key on public.salas(qr_token);
create unique index if not exists salas_codigo_manual_key on public.salas(codigo_manual);

commit;

-- Verificación (opcional):
--   select id_sala, qr_token, codigo_manual from public.salas order by id_sala;
