-- ==============================================================
-- DB-Reservas — Salas iniciales del sistema
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto DB-Reservas)
-- ==============================================================
--
-- Carga las 12 salas que la aplicación definía por defecto en el
-- código (SALAS_INICIALES de src/app/page.tsx), ahora persistidas
-- en public.salas.
--
-- Es idempotente: si una sala ya existe (mismo id_sala), no la
-- duplica ni sobrescribe cambios manuales.
-- ==============================================================

insert into public.salas (id_sala, nombre_descriptivo, tipo, aforo, piso, estado_habilitacion)
values
  ('LAB-01', 'Lab Turing',         'lab',  30, 1, 'activo'),
  ('LAB-02', 'Lab Lovelace',       'lab',  25, 1, 'activo'),
  ('LAB-03', 'Lab Hopper',         'lab',  20, 2, 'activo'),
  ('SAL-01', 'Sala Mistral',       'sala', 40, 2, 'activo'),
  ('SAL-02', 'Sala Neruda',        'sala', 35, 3, 'activo'),
  ('SAL-03', 'Sala Parra',         'sala', 18, 3, 'activo'),
  ('AUD-01', 'Auditorio Atacama',  'aud', 120, 1, 'activo'),
  ('CON-01', 'Sala Cordillera',    'conf', 15, 2, 'activo'),
  ('CON-02', 'Sala Altiplano',     'conf',  8, 2, 'activo'),
  ('BIB-01', 'Estudio Maipo',      'bib',   6, 1, 'activo'),
  ('BIB-02', 'Estudio Loa',        'bib',   6, 1, 'activo'),
  ('BIB-03', 'Estudio Biobío',     'bib',   4, 2, 'activo')
on conflict do nothing;

-- ==============================================================
-- Verificación
-- ==============================================================
-- select id_sala, nombre_descriptivo, tipo, aforo, piso, estado_habilitacion
-- from public.salas
-- order by id_sala;
-- ==============================================================
