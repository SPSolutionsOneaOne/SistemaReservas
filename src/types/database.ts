// ============================================================
// TIPOS TYPESCRIPT - FUENTE DE VERDAD DESDE DICCIONARIO DE DATOS SQL
// Sistema de Reservas Institucional
// ============================================================

// ==============================================================
// DB-Institucional (Padrón / Autenticación)
// ==============================================================

/** Roles válidos del sistema según CHECK constraint */
export type RolUsuario =
  | 'alumno'
  | 'docente'
  | 'encargado_administrativo'
  | 'administrador';

/** Tabla: public.usuarios_institucion — DB-Institucional */
export interface UsuarioInstitucion {
  /** uuid, PK, default uuid_generate_v4() */
  id: string;
  /** varchar(12), unique, NOT NULL — Ej: '12.345.678-5' */
  rut: string;
  /** nombre atomizado: primer nombre de pila */
  primer_nombre: string;
  /** nombre atomizado: segundo nombre de pila (puede ser NULL) */
  segundo_nombre: string | null;
  /** nombre atomizado: apellido paterno */
  apellido_paterno: string;
  /** nombre atomizado: apellido materno (puede ser NULL) */
  apellido_materno: string | null;
  /** nombre_completo es una columna GENERATED: concatena los 4 campos */
  nombre_completo: string;
  /** varchar(150), unique, NOT NULL — Dominio @institucion.cl */
  correo_institucional: string;
  /** text, NOT NULL — Cifrado con Argon2id (ISO/IEC 27002:2022) */
  password_hash: string;
  /** varchar(30), NOT NULL — CHECK: 'alumno','docente','encargado_administrativo','administrador' */
  rol: RolUsuario;
  /** varchar(100), NULL */
  carrera_o_departamento: string | null;
  /** boolean, default true */
  estado_activo: boolean;
  /** timestamp, default now() */
  creado_en: string;
}

/** DTO para inserción — campos opcionales tienen defaults en DB */
export interface UsuarioInstitucionInsert {
  rut: string;
  primer_nombre: string;
  segundo_nombre?: string | null;
  apellido_paterno: string;
  apellido_materno?: string | null;
  correo_institucional: string;
  password_hash: string;
  rol: RolUsuario;
  carrera_o_departamento?: string | null;
  estado_activo?: boolean;
}

/** DTO para actualización parcial */
export type UsuarioInstitucionUpdate = Partial<
  Omit<UsuarioInstitucion, 'id' | 'creado_en'>
>;

// ==============================================================
// DB-Reservas (Lógica de Negocio y Salas)
// ==============================================================

// --- Tabla: public.salas (Factory Method - SalaFactory) ---

/**
 * Tipos de sala: catálogo dinámico administrado en la tabla public.tipos_sala
 * (DB-Reservas). Ya no es una unión fija — el administrador puede crear,
 * editar y eliminar tipos desde el panel. Los 5 tipos originales
 * (lab, sala, aud, conf, bib) existen también como filas de la tabla.
 */
export type TipoSala = string;

/** Fila de public.tipos_sala */
export interface TipoSalaDef {
  id: string;
  nombre: string;
  prefijo: string;
  aforo_sugerido: number;
  color: string;
  orden: number;
  creado_en?: string;
}

/** Estados de habilitación válidos según CHECK constraint */
export type EstadoHabilitacion = 'activo' | 'mantencion' | 'inactivo';

/** Tabla: public.salas — DB-Reservas */
export interface Sala {
  /** varchar(20), PK — Sigla incremental formato 'AAA-00' (Ej: LAB-01, AUD-01) (RF-FUN-12) */
  id_sala: string;
  /** varchar(100), unique, NOT NULL — Ej: 'Laboratorio Turing' */
  nombre_descriptivo: string;
  /** varchar(30), NOT NULL, FK → tipos_sala.id */
  tipo: TipoSala;
  /** int, NOT NULL, CHECK > 0 */
  aforo: number;
  /** int, NOT NULL, CHECK 1-9 */
  piso: number;
  /** varchar(20), default 'activo' — CHECK: 'activo','mantencion','inactivo' */
  estado_habilitacion: EstadoHabilitacion;
  /** timestamp, default now() */
  creado_en: string;
}

/** DTO para inserción — el id_sala se genera por SalaFactory */
export interface SalaInsert {
  id_sala: string;
  nombre_descriptivo: string;
  tipo: TipoSala;
  aforo: number;
  piso: number;
  estado_habilitacion?: EstadoHabilitacion;
}

/** DTO para actualización parcial */
export type SalaUpdate = Partial<Omit<Sala, 'id_sala' | 'creado_en'>>;

// --- Tabla: public.reservas (Transaccional) ---

/** Estados de reserva válidos según CHECK constraint */
export type EstadoReserva = 'confirmada' | 'cancelada' | 'completada' | 'no_asistio';

/**
 * Tabla: public.reservas — DB-Reservas
 *
 * Restricción Única de Concurrencia:
 * UNIQUE(id_sala, fecha, bloque_horario) → HTTP 409 si hay solape
 */
export interface Reserva {
  /** uuid, PK, default uuid_generate_v4() */
  id_reserva: string;
  /** varchar(20), unique, NOT NULL — Ej: 'RES-1042' */
  codigo_reserva: string;
  /** varchar(20), FK → salas.id_sala, ON DELETE CASCADE */
  id_sala: string;
  /** varchar(12), NOT NULL — RUT del titular validado en DB-Institucional */
  usuario_rut: string;
  /** date, NOT NULL — formato ISO 'YYYY-MM-DD' */
  fecha: string;
  /** int, NOT NULL, CHECK 0-17 — 18 bloques diarios de 45 min */
  bloque_horario: number;
  /** int, NOT NULL */
  cantidad_asistentes: number;
  /** varchar(100), NOT NULL */
  proposito: string;
  /** varchar(20), default 'confirmada' — CHECK: 'confirmada','cancelada','completada' */
  estado: EstadoReserva;
  /** timestamp, NULL — Registro de Check-in por QR / Código manual */
  asistencia_registrada_en: string | null;
  /** timestamp, default now() */
  creado_en: string;
}

/** DTO para inserción de reserva */
export interface ReservaInsert {
  codigo_reserva: string;
  id_sala: string;
  usuario_rut: string;
  fecha: string;
  bloque_horario: number;
  cantidad_asistentes: number;
  proposito: string;
  estado?: EstadoReserva;
}

/** DTO para actualización parcial de reserva */
export type ReservaUpdate = Partial<
  Omit<Reserva, 'id_reserva' | 'codigo_reserva' | 'creado_en'>
>;

// --- Tabla: public.historial_penalizaciones (Motor de Penalización) ---

/** Tabla: public.historial_penalizaciones — DB-Reservas */
export interface HistorialPenalizacion {
  /** uuid, PK */
  id: string;
  /** varchar(12), NOT NULL */
  usuario_rut: string;
  /** int, default 0 — Si llega a 3, bloquea. Si asiste, se resetea. */
  ausencias_acumuladas: number;
  /** timestamp, NULL — Fecha límite del bloqueo de 1 semana */
  bloqueado_hasta: string | null;
  /** timestamp, default now() */
  ultima_actualizacion: string;
}

/** DTO para inserción de penalización */
export interface HistorialPenalizacionInsert {
  usuario_rut: string;
  ausencias_acumuladas?: number;
  bloqueado_hasta?: string | null;
}

/** DTO para actualización parcial */
export type HistorialPenalizacionUpdate = Partial<
  Omit<HistorialPenalizacion, 'id'>
>;

// --- Tabla: public.bitacora_administrativa (Auditoría RF-SEC-04) ---

/** Tabla: public.bitacora_administrativa — DB-Reservas */
export interface BitacoraAdministrativa {
  /** uuid, PK */
  id: string;
  /** varchar(12), NOT NULL — RUT del administrativo presencial */
  encargado_rut: string;
  /** text, NOT NULL */
  accion: string;
  /** varchar(12), NOT NULL */
  rut_estudiante_afectado: string;
  /** timestamp, default now() */
  creado_en: string;
}

/** DTO para inserción de bitácora */
export interface BitacoraAdministrativaInsert {
  encargado_rut: string;
  accion: string;
  rut_estudiante_afectado: string;
}

// ==============================================================
// CONSTANTES DEL DOMINIO
// ==============================================================

/**
 * Mapeo de bloques horarios a rangos de hora (18 bloques de 45 min).
 * Horarios del cliente: lunes a viernes 08:30–22:00 (bloques 0-17) y
 * sábado 08:30–13:45 (bloques 0-6). Domingos sin servicio.
 */
export const BLOQUES_HORARIOS: Record<number, { inicio: string; fin: string }> = {
  0:  { inicio: '08:30', fin: '09:15' },
  1:  { inicio: '09:15', fin: '10:00' },
  2:  { inicio: '10:00', fin: '10:45' },
  3:  { inicio: '10:45', fin: '11:30' },
  4:  { inicio: '11:30', fin: '12:15' },
  5:  { inicio: '12:15', fin: '13:00' },
  6:  { inicio: '13:00', fin: '13:45' },
  7:  { inicio: '13:45', fin: '14:30' },
  8:  { inicio: '14:30', fin: '15:15' },
  9:  { inicio: '15:15', fin: '16:00' },
  10: { inicio: '16:00', fin: '16:45' },
  11: { inicio: '16:45', fin: '17:30' },
  12: { inicio: '17:30', fin: '18:15' },
  13: { inicio: '18:15', fin: '19:00' },
  14: { inicio: '19:00', fin: '19:45' },
  15: { inicio: '19:45', fin: '20:30' },
  16: { inicio: '20:30', fin: '21:15' },
  17: { inicio: '21:15', fin: '22:00' },
};

/** Dominios institucionales válidos para validación RN04 */
export const DOMINIOS_INSTITUCIONALES = [
  '@institucion.cl',
] as const;

/** Máximo de ausencias antes de bloqueo */
export const MAX_AUSENCIAS_ANTES_BLOQUEO = 3;

/** Duración del bloqueo por penalización (días) */
export const DIAS_BLOQUEO_PENALIZACION = 7;

/** Minutos de gracia tras el inicio del bloque para el check-in */
export const MINUTOS_GRACIA_CHECKIN = 10;
