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
  /** varchar(150), NOT NULL */
  nombre_completo: string;
  /** varchar(150), unique, NOT NULL — Dominio @institucion.cl / @inacapmail.cl */
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
  nombre_completo: string;
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

/** Tipos de sala válidos según CHECK constraint */
export type TipoSala = 'lab' | 'sala' | 'aud' | 'conf' | 'bib';

/** Estados de habilitación válidos según CHECK constraint */
export type EstadoHabilitacion = 'activo' | 'mantencion' | 'inactivo';

/** Tabla: public.salas — DB-Reservas */
export interface Sala {
  /** varchar(20), PK — Sigla incremental formato 'AAA-00' (Ej: LAB-01, AUD-01) (RF-FUN-12) */
  id_sala: string;
  /** varchar(100), unique, NOT NULL — Ej: 'Laboratorio Turing' */
  nombre_descriptivo: string;
  /** varchar(30), NOT NULL — 'lab','sala','aud','conf','bib' */
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
  /** int, NOT NULL, CHECK 0-13 — 14 bloques diarios de 45 min */
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

/** Mapeo de bloques horarios (0-13) a rangos de hora (14 bloques de 45 min) */
export const BLOQUES_HORARIOS: Record<number, { inicio: string; fin: string }> = {
  0:  { inicio: '08:00', fin: '08:45' },
  1:  { inicio: '08:45', fin: '09:30' },
  2:  { inicio: '09:30', fin: '10:15' },
  3:  { inicio: '10:15', fin: '11:00' },
  4:  { inicio: '11:00', fin: '11:45' },
  5:  { inicio: '11:45', fin: '12:30' },
  6:  { inicio: '12:30', fin: '13:15' },
  7:  { inicio: '13:15', fin: '14:00' },
  8:  { inicio: '14:00', fin: '14:45' },
  9:  { inicio: '14:45', fin: '15:30' },
  10: { inicio: '15:30', fin: '16:15' },
  11: { inicio: '16:15', fin: '17:00' },
  12: { inicio: '17:00', fin: '17:45' },
  13: { inicio: '17:45', fin: '18:30' },
};

/** Prefijos de sigla por tipo de sala (SalaFactory) */
export const PREFIJOS_SALA: Record<TipoSala, string> = {
  lab:  'LAB',
  sala: 'SAL',
  aud:  'AUD',
  conf: 'CON',
  bib:  'BIB',
};

/** Dominios institucionales válidos para validación RN04 */
export const DOMINIOS_INSTITUCIONALES = [
  '@institucion.cl',
  '@inacapmail.cl',
] as const;

/** Máximo de ausencias antes de bloqueo */
export const MAX_AUSENCIAS_ANTES_BLOQUEO = 3;

/** Duración del bloqueo por penalización (días) */
export const DIAS_BLOQUEO_PENALIZACION = 7;

/** Minutos de gracia tras el inicio del bloque para el check-in */
export const MINUTOS_GRACIA_CHECKIN = 10;
