'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  TipoSala,
  UsuarioInstitucion,
  BLOQUES_HORARIOS,
  PREFIJOS_SALA,
} from '@/types/database';
import { validarRutChileno } from '@/lib/validators';

// --- Constantes del Dominio Visual ---
interface TipoDef {
  id: TipoSala;
  code: string;
  name: string;
  c: string;
  cap: number;
  sug: string[];
}

const TIPOS: TipoDef[] = [
  { id: 'lab', code: 'LAB', name: 'Laboratorio', c: 'var(--t-lab)', cap: 30, sug: ['Lab Turing', 'Lab Lovelace', 'Lab Hopper', 'Lab Knuth'] },
  { id: 'sala', code: 'SALA', name: 'Sala de clases', c: 'var(--t-sala)', cap: 35, sug: ['Sala Mistral', 'Sala Neruda', 'Sala Parra', 'Sala Huidobro'] },
  { id: 'aud', code: 'AUD', name: 'Auditorio', c: 'var(--t-aud)', cap: 100, sug: ['Auditorio Atacama', 'Auditorio Patagonia', 'Auditorio Rapa Nui'] },
  { id: 'conf', code: 'CONF', name: 'Reuniones', c: 'var(--t-conf)', cap: 12, sug: ['Sala Cordillera', 'Sala Altiplano', 'Sala Pehuén'] },
  { id: 'bib', code: 'BIB', name: 'Biblioteca', c: 'var(--t-bib)', cap: 6, sug: ['Estudio Maipo', 'Estudio Loa', 'Estudio Biobío', 'Estudio Aconcagua'] },
];

interface SalaVisual {
  code: string;
  type: TipoSala;
  name: string;
  cap: number;
  floor: number;
}

const SALAS_INICIALES: SalaVisual[] = [
  { code: 'LAB-01', type: 'lab', name: 'Lab Turing', cap: 30, floor: 1 },
  { code: 'LAB-02', type: 'lab', name: 'Lab Lovelace', cap: 25, floor: 1 },
  { code: 'LAB-03', type: 'lab', name: 'Lab Hopper', cap: 20, floor: 2 },
  { code: 'SAL-01', type: 'sala', name: 'Sala Mistral', cap: 40, floor: 2 },
  { code: 'SAL-02', type: 'sala', name: 'Sala Neruda', cap: 35, floor: 3 },
  { code: 'SAL-03', type: 'sala', name: 'Sala Parra', cap: 18, floor: 3 },
  { code: 'AUD-01', type: 'aud', name: 'Auditorio Atacama', cap: 120, floor: 1 },
  { code: 'CON-01', type: 'conf', name: 'Sala Cordillera', cap: 15, floor: 2 },
  { code: 'CON-02', type: 'conf', name: 'Sala Altiplano', cap: 8, floor: 2 },
  { code: 'BIB-01', type: 'bib', name: 'Estudio Maipo', cap: 6, floor: 1 },
  { code: 'BIB-02', type: 'bib', name: 'Estudio Loa', cap: 6, floor: 1 },
  { code: 'BIB-03', type: 'bib', name: 'Estudio Biobío', cap: 4, floor: 2 },
];

const GRUPOS = [
  ['Mañana', 0, 5],
  ['Tarde', 6, 10],
  ['Noche', 11, 13],
] as const;

const PURPOSES = [
  'Estudio grupal',
  'Reunión de proyecto',
  'Práctica',
  'Clase o taller',
  'Otro',
];

interface ReservaVisual {
  id: string | number;
  code: string;
  room: string;
  dateStr: string;
  block: number;
  userRut: string;
  attendees: string[];
  purpose: string;
  attended: string | null;
}

interface OcupacionItem {
  id_sala: string;
  bloque_horario: number;
}

function fmtRut(v: string) {
  const clean = v.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  return clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + clean.slice(-1);
}

/**
 * Formato automático de RUT en el login (puntos y guion).
 * El campo acepta “RUT o correo institucional”, por lo que:
 * - Si contiene '@', es correo: se deja intacto.
 * - Si contiene letras distintas de K (correo en edición), se deja intacto.
 * - Solo se formatea cuando el valor usa caracteres de RUT (dígitos, K, puntos, guion).
 */
function formatearIdentificadorLogin(v: string): string {
  // Correo (contiene '@'): no tocar.
  if (v.includes('@')) return v;
  // Letras que no son K (correo en edición): no tocar.
  if (!/^[0-9kK.\-\s]*$/.test(v)) return v;
  // Solo caracteres de RUT: formatear (fmtRut elimina los espacios).
  return fmtRut(v);
}

function hashCode(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Fecha local en formato YYYY-MM-DD.
 * No usar toISOString(): convierte a UTC y puede desplazar el día.
 */
function toLocalDateStr(date: Date): string {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function claveOcupacion(fecha: string, idSala: string, bloque: number): string {
  return `${fecha}|${idSala}|${bloque}`;
}

export default function ReservaPage() {
  // Autenticación & Rol Real
  const [currentUser, setCurrentUser] = useState<Partial<UsuarioInstitucion> | null>(null);
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Theme
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [view, setView] = useState<'reservar' | 'reserva-tercero' | 'mis' | 'asist' | 'admin' | 'bitacora'>('reservar');

  // Flujo de Reserva
  const [step, setStep] = useState<number>(0);
  const [selectedType, setSelectedType] = useState<TipoSala | null>(null);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(0);
  const [weekStartIdx, setWeekStartIdx] = useState(0);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [selectedRoomCode, setSelectedRoomCode] = useState<string | null>(null);
  const [rutInput, setRutInput] = useState<string>('');
  const [rutMsg, setRutMsg] = useState<string>('');
  const [validatingRut, setValidatingRut] = useState<boolean>(false);
  const [attendees, setAttendees] = useState<string[]>([]);
  const [selectedPurpose, setSelectedPurpose] = useState<string | null>(null);
  const [detail, setDetail] = useState<string>('');
  const [lastBooking, setLastBooking] = useState<ReservaVisual | null>(null);

  // Reserva Asistida a Tercero (RF-SEC-04 - Encargado Administrativo)
  const [estudianteRut, setEstudianteRut] = useState('');
  const [estudianteValido, setEstudianteValido] = useState<UsuarioInstitucion | null>(null);
  const [estudianteMsg, setEstudianteMsg] = useState('');

  // Salas & Reservas
  const [salas, setSalas] = useState<SalaVisual[]>(SALAS_INICIALES);
  const [reservas, setReservas] = useState<ReservaVisual[]>([]);
  const [ocupacion, setOcupacion] = useState<Record<string, true>>({});
  const [ocupacionCargando, setOcupacionCargando] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Asistencia (Check-in)
  const [asistenciaReserva, setAsistenciaReserva] = useState<ReservaVisual | null>(null);
  const [asistModo, setAsistModo] = useState<'scan' | 'manual' | 'ok'>('scan');
  const [scanning, setScanning] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');
  const [manualCodeError, setManualCodeError] = useState('');

  // Admin - Nueva Sala (SalaFactory)
  const [adminType, setAdminType] = useState<TipoSala>('lab');
  const [adminName, setAdminName] = useState('');
  const [adminCap, setAdminCap] = useState(30);
  const [adminFloor, setAdminFloor] = useState(1);
  const [adminMsg, setAdminMsg] = useState('');

  // Modal QR
  const [qrModalData, setQrModalData] = useState<{ room: SalaVisual; qrSvg: string; code: string } | null>(null);

  // Edición / Eliminación de reserva (CRUD)
  const [editando, setEditando] = useState<ReservaVisual | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editBloque, setEditBloque] = useState<number | null>(null);
  const [editProposito, setEditProposito] = useState('');
  const [editAsistentes, setEditAsistentes] = useState(1);
  const [editOcupacion, setEditOcupacion] = useState<Record<string, true>>({});
  const [editCargando, setEditCargando] = useState(false);
  const [editGuardando, setEditGuardando] = useState(false);
  const [editError, setEditError] = useState('');
  const [eliminandoId, setEliminandoId] = useState<string | number | null>(null);

  // 7 días disponibles
  const days = useMemo(() => {
    const list: Date[] = [];
    const today = new Date();
    const remainingDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
    for (let i = 0; i < remainingDays; i++) {
      list.push(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    }
    return list;
  }, []);
  const visibleDays = days.slice(weekStartIdx, weekStartIdx + 7);

  // Carga inicial
  useEffect(() => {
    const savedTheme = localStorage.getItem('rs-theme') as 'light' | 'dark' | null;
    const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);

    // Cargar salas desde Supabase
    fetch('/api/salas')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          const map = data.map((s: { id_sala: string; tipo: TipoSala; nombre_descriptivo: string; aforo: number; piso: number }) => ({
            code: s.id_sala,
            type: s.tipo,
            name: s.nombre_descriptivo,
            cap: s.aforo,
            floor: s.piso,
          }));
          setSalas(map);
        }
      })
      .catch(() => {});
  }, []);

  // Cargar las reservas del usuario autenticado (no solo las creadas en esta sesión).
  useEffect(() => {
    if (!currentUser) {
      setReservas([]);
      return;
    }

    const controller = new AbortController();

    fetch('/api/reservas', { signal: controller.signal })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (!Array.isArray(data)) return;
        const mapeadas: ReservaVisual[] = data.map(
          (r: {
            id_reserva?: string;
            codigo_reserva?: string;
            id_sala?: string;
            fecha?: string;
            bloque_horario?: number;
            usuario_rut?: string;
            proposito?: string;
            asistencia_registrada_en?: string | null;
          }) => ({
            id: r.id_reserva || `${r.id_sala}-${r.fecha}-${r.bloque_horario}`,
            code: r.codigo_reserva || '',
            room: r.id_sala || '',
            dateStr: r.fecha || '',
            block: r.bloque_horario ?? 0,
            userRut: r.usuario_rut || '',
            attendees: [],
            purpose: r.proposito || '',
            attended: r.asistencia_registrada_en || null,
          })
        );
        setReservas(mapeadas);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Silencioso: la vista de reservas mostrará el estado vacío.
      });

    return () => controller.abort();
  }, [currentUser]);

  // Disponibilidad real: consulta la ocupación registrada para la fecha seleccionada.
  useEffect(() => {
    if (!currentUser) {
      setOcupacion({});
      return;
    }

    const day = days[selectedDayIdx];
    if (!day) return;

    const fecha = toLocalDateStr(day);
    const controller = new AbortController();
    setOcupacionCargando(true);

    fetch(`/api/reservas/ocupacion?fecha=${encodeURIComponent(fecha)}`, {
      signal: controller.signal,
    })
      .then((resp) => {
        if (!resp.ok) throw new Error('No fue posible cargar la disponibilidad');
        return resp.json() as Promise<{ ocupacion?: OcupacionItem[] }>;
      })
      .then((data) => {
        const next: Record<string, true> = {};
        for (const item of data.ocupacion ?? []) {
          if (item && typeof item.id_sala === 'string' && Number.isInteger(item.bloque_horario)) {
            next[claveOcupacion(fecha, item.id_sala, item.bloque_horario)] = true;
          }
        }
        setOcupacion(next);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Ante un error no se inventa ocupación: el servidor seguirá rechazando
        // cualquier solape real con un 409.
        setOcupacion({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setOcupacionCargando(false);
      });

    return () => controller.abort();
  }, [currentUser, days, selectedDayIdx]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('rs-theme', next);
  };

  const showToast = (text: string) => {
    setToastMsg(text);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const getManualCode = (roomCode: string): string => {
    return String(100000 + Math.floor(hashCode('qr' + roomCode) * 899999));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');

    try {
      // Normaliza por si el valor llegó por autocompletado sin pasar por onChange.
      const identificador = formatearIdentificadorLogin(loginId.trim());
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador, password: loginPass }),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setLoginError(data.error || 'Credenciales inválidas');
        setLoginLoading(false);
        return;
      }

      setCurrentUser(data.usuario);
      setView('reservar');
      setStep(0);
      showToast(`Bienvenido ${data.usuario.nombre_completo} (${data.usuario.rol})`);
    } catch {
      setLoginError('Error de conexión con el servidor');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Si falla la llamada, igual limpiamos el estado local.
    }
    setCurrentUser(null);
    setLoginId('');
    setLoginPass('');
    showToast('Sesión cerrada');
  };

  // Verificar Estudiante Afectado para Encargado Administrativo
  const handleValidarEstudianteTercero = async () => {
    const clean = fmtRut(estudianteRut);
    if (!validarRutChileno(clean)) {
      setEstudianteMsg('RUT chileno inválido (dígito verificador incorrecto).');
      setEstudianteValido(null);
      return;
    }

    try {
      const resp = await fetch('/api/usuarios/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: clean }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setEstudianteMsg(data.error || 'Estudiante no encontrado en padrón institucional');
        setEstudianteValido(null);
        return;
      }

      if (data.bloqueado) {
        setEstudianteMsg(`⚠️ ${data.mensajeBloqueo}`);
        setEstudianteValido(null);
        return;
      }

      setEstudianteValido(data.usuario);
      setEstudianteMsg(`✅ Estudiante verificado: ${data.usuario.nombre_completo} (${data.usuario.carrera_o_departamento || 'INACAP'})`);
    } catch {
      setEstudianteValido(null);
      setEstudianteMsg('No fue posible validar al estudiante. Intenta nuevamente.');
    }
  };

  const selectedRoom = useMemo(() => {
    return salas.find((r) => r.code === selectedRoomCode) || null;
  }, [salas, selectedRoomCode]);

  const isRoomFree = useCallback(
    (room: SalaVisual, day: Date, blk: number) => {
      // Los domingos no hay atención (regla institucional).
      if (day.getDay() === 0) return false;
      const dStr = toLocalDateStr(day);
      // Solo está ocupada si existe una reserva confirmada/completada real.
      return !ocupacion[claveOcupacion(dStr, room.code, blk)];
    },
    [ocupacion]
  );

  const freeRooms = useMemo(() => {
    if (!selectedType || selectedBlock === null) return [];
    const day = days[selectedDayIdx];
    return salas.filter((r) => r.type === selectedType && isRoomFree(r, day, selectedBlock));
  }, [salas, selectedType, selectedDayIdx, selectedBlock, days, isRoomFree]);

  const handleSelectType = (tipo: TipoSala) => {
    setSelectedType(tipo);
    setSelectedBlock(null);
    setSelectedRoomCode(null);
    setTimeout(() => setStep(1), 150);
  };

  const handleSelectBlock = (blk: number) => {
    setSelectedBlock(blk);
    setSelectedRoomCode(null);
    setTimeout(() => setStep(2), 150);
  };

  const handleSelectRoom = (code: string) => {
    setSelectedRoomCode(code);
    setTimeout(() => setStep(3), 150);
  };

  // Validación estricta 100% Asistentes Institucionales (RN04)
  const handleAddRut = async () => {
    const clean = fmtRut(rutInput);
    if (!clean) {
      setRutMsg('Escribe un RUT.');
      return;
    }
    if (!validarRutChileno(clean)) {
      setRutMsg('RUT no válido (dígito verificador incorrecto).');
      return;
    }
    if (attendees.includes(clean)) {
      setRutMsg('Este RUT ya está en la lista.');
      return;
    }
    if (selectedRoom && attendees.length + 1 >= selectedRoom.cap) {
      setRutMsg(`Capacidad máxima alcanzada (${selectedRoom.cap} personas).`);
      return;
    }

    setValidatingRut(true);
    setRutMsg('');

    try {
      const resp = await fetch('/api/usuarios/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: clean }),
      });
      const data = await resp.json();

      if (!resp.ok) {
        setRutMsg(data.error || 'El asistente no pertenece al padrón institucional.');
        setValidatingRut(false);
        return;
      }

      setAttendees([...attendees, clean]);
      setRutInput('');
      setRutMsg('');
    } catch {
      setRutMsg('No fue posible validar el RUT. Intenta nuevamente.');
    } finally {
      setValidatingRut(false);
    }
  };

  const handleRemoveRut = (idx: number) => {
    setAttendees(attendees.filter((_, i) => i !== idx));
  };

  // Confirmación de reserva
  const handleConfirmReserva = async () => {
    if (!selectedRoom || selectedBlock === null || !selectedPurpose || !currentUser) return;

    // Si es reserva a tercero, el titular es el estudiante
    const esTercero = view === 'reserva-tercero';
    if (esTercero && !estudianteValido) {
      showToast('⚠️ Debe verificar primero el RUT del estudiante beneficiario');
      return;
    }

    const rutTitular = esTercero && estudianteValido ? estudianteValido.rut : (currentUser.rut || '12.345.678-5');
    const day = days[selectedDayIdx];
    const dateStr = toLocalDateStr(day);
    const nextId = reservas.length + 1;
    const generatedCode = 'RES-' + Math.floor(1000 + Math.random() * 8999);

    const nuevaReserva: ReservaVisual = {
      id: nextId,
      code: generatedCode,
      room: selectedRoom.code,
      dateStr,
      block: selectedBlock,
      userRut: rutTitular,
      attendees: [...attendees],
      purpose: selectedPurpose + (detail ? ` - ${detail}` : ''),
      attended: null,
    };

    try {
      const resp = await fetch('/api/reservas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_sala: selectedRoom.code,
          usuario_rut: rutTitular,
          fecha: dateStr,
          bloque_horario: selectedBlock,
          cantidad_asistentes: attendees.length + 1,
          proposito: nuevaReserva.purpose,
          asistentes: attendees,
        }),
      });

      const data = (await resp.json().catch(() => null)) as
        | {
            error?: string;
            id_reserva?: string;
            id_sala?: string;
            codigo_reserva?: string;
            fecha?: string;
            bloque_horario?: number;
            usuario_rut?: string;
            proposito?: string;
          }
        | null;

      if (!resp.ok) {
        showToast(data?.error || 'No fue posible registrar la reserva');
        return;
      }

      // Usa los identificadores generados por el servidor (código real de reserva).
      const reservaConfirmada: ReservaVisual = {
        ...nuevaReserva,
        id: data?.id_reserva || nuevaReserva.id,
        code: data?.codigo_reserva || nuevaReserva.code,
        room: data?.id_sala || nuevaReserva.room,
        dateStr: data?.fecha || nuevaReserva.dateStr,
        block: data?.bloque_horario ?? nuevaReserva.block,
        userRut: data?.usuario_rut || nuevaReserva.userRut,
        purpose: data?.proposito || nuevaReserva.purpose,
      };

      // Refleja la ocupación de inmediato, sin esperar a recargar la fecha.
      setOcupacion((prev) => ({
        ...prev,
        [claveOcupacion(
          reservaConfirmada.dateStr,
          reservaConfirmada.room,
          reservaConfirmada.block
        )]: true,
      }));

      setReservas([reservaConfirmada, ...reservas]);
      setLastBooking(reservaConfirmada);
      setStep(4);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Sin toast en éxito: el panel de confirmación (paso 4) ya lo comunica.
    } catch {
      showToast('No fue posible conectar con el servidor. Intenta nuevamente.');
    }
  };

  const resetFlow = () => {
    setStep(0);
    setSelectedType(null);
    setSelectedBlock(null);
    setSelectedRoomCode(null);
    setAttendees([]);
    setSelectedPurpose(null);
    setDetail('');
    setLastBooking(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Check-in
  const openAsistencia = (res: ReservaVisual) => {
    setAsistenciaReserva(res);
    setAsistModo('scan');
    setScanning(false);
    setManualCodeInput('');
    setManualCodeError('');
    setView('asist');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSimularScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      completarAsistencia();
    }, 1300);
  };

  const handleManualCodeSubmit = () => {
    if (!asistenciaReserva) return;
    const expected = getManualCode(asistenciaReserva.room);
    if (manualCodeInput.trim() === expected) {
      completarAsistencia();
    } else {
      setManualCodeError(`Código incorrecto. Pista: ${expected}`);
    }
  };

  const completarAsistencia = async () => {
    if (!asistenciaReserva) return;
    try {
      const resp = await fetch('/api/reservas/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_reserva: asistenciaReserva.code }),
      });

      const data = (await resp.json().catch(() => null)) as { error?: string } | null;

      if (!resp.ok) {
        setManualCodeError(data?.error || 'No fue posible registrar la asistencia.');
        return;
      }

      const nowIso = new Date().toISOString();
      setReservas((prev) =>
        prev.map((r) =>
          r.id === asistenciaReserva.id ? { ...r, attended: nowIso } : r
        )
      );
      setAsistModo('ok');
    } catch {
      setManualCodeError('No fue posible conectar con el servidor. Intenta nuevamente.');
    }
  };

  // ---- CRUD: Editar y Eliminar reserva ----

  const abrirEdicion = (res: ReservaVisual) => {
    setEditando(res);
    setEditFecha(res.dateStr);
    setEditBloque(res.block);
    setEditProposito(res.purpose);
    setEditAsistentes(Math.max(1, res.attendees.length || 1));
    setEditError('');
    setEditGuardando(false);
  };

  const cerrarEdicion = () => {
    setEditando(null);
    setEditOcupacion({});
    setEditError('');
  };

  // Ocupación de la fecha en edición (excluye el bloque actual de la reserva).
  useEffect(() => {
    if (!editando || !editFecha) return;
    const controller = new AbortController();
    setEditCargando(true);
    fetch(`/api/reservas/ocupacion?fecha=${encodeURIComponent(editFecha)}&id_sala=${encodeURIComponent(editando.room)}`, {
      signal: controller.signal,
    })
      .then((resp) => {
        if (!resp.ok) throw new Error('Ocupación no disponible');
        return resp.json() as Promise<{ ocupacion?: OcupacionItem[] }>;
      })
      .then((data) => {
        const esMismoBloque = (item: OcupacionItem) =>
          item.id_sala === editando.room &&
          editFecha === editando.dateStr &&
          item.bloque_horario === editando.block;
        const next: Record<string, true> = {};
        for (const item of data.ocupacion ?? []) {
          if (item && typeof item.id_sala === 'string' && Number.isInteger(item.bloque_horario) && !esMismoBloque(item)) {
            next[claveOcupacion(editFecha, item.id_sala, item.bloque_horario)] = true;
          }
        }
        setEditOcupacion(next);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setEditOcupacion({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setEditCargando(false);
      });
    return () => controller.abort();
  }, [editando, editFecha, editando?.room, editando?.dateStr, editando?.block]);

  const guardarEdicion = async () => {
    if (!editando || editBloque === null) return;
    const fechaMaxima = toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0));
    if (editFecha > fechaMaxima) {
      setEditError('Solo se puede agendar dentro del mes en curso.');
      return;
    }
    const sala = salas.find((s) => s.code === editando.room);
    if (editAsistentes < 1 || (sala && editAsistentes >= sala.cap)) {
      setEditError(`La cantidad de asistentes debe estar entre 1 y ${sala ? sala.cap - 1 : 30}.`);
      return;
    }
    setEditGuardando(true);
    setEditError('');
    try {
      const resp = await fetch('/api/reservas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_reserva: editando.id,
          fecha: editFecha,
          bloque_horario: editBloque,
          cantidad_asistentes: editAsistentes,
          proposito: editProposito.trim() || editando.purpose,
        }),
      });
      const data = (await resp.json().catch(() => null)) as
        | {
            error?: string;
            id_reserva?: string;
            id_sala?: string;
            fecha?: string;
            bloque_horario?: number;
            proposito?: string;
          }
        | null;
      if (!resp.ok) {
        setEditError(data?.error || 'No fue posible guardar los cambios. Intenta nuevamente.');
        return;
      }
      setReservas((prev) =>
        prev.map((r) =>
          r.id === editando.id
            ? {
                ...r,
                dateStr: data?.fecha || editFecha,
                block: data?.bloque_horario ?? editBloque,
                purpose: data?.proposito || editProposito.trim() || r.purpose,
                attendees: Array.from({ length: editAsistentes }, (_, i) => r.attendees[i] || ''),
              }
            : r
        )
      );
      // Refresca la ocupación local de ambas fechas.
      setOcupacion((prev) => {
        const next = { ...prev };
        delete next[claveOcupacion(editando.dateStr, editando.room, editando.block)];
        next[claveOcupacion(editFecha, editando.room, editBloque)] = true;
        return next;
      });
      cerrarEdicion();
      showToast('Reserva actualizada');
    } catch {
      setEditError('No fue posible conectar con el servidor. Intenta nuevamente.');
    } finally {
      setEditGuardando(false);
    }
  };

  const eliminarReserva = async (res: ReservaVisual) => {
    if (!window.confirm(`¿Cancelar la reserva ${res.code} (${res.room}, ${res.dateStr})? Esta acción no se puede deshacer.`)) {
      return;
    }
    setEliminandoId(res.id);
    try {
      const resp = await fetch(`/api/reservas?id_reserva=${encodeURIComponent(String(res.id))}`, {
        method: 'DELETE',
      });
      const data = (await resp.json().catch(() => null)) as { error?: string } | null;
      if (!resp.ok) {
        showToast(data?.error || 'No fue posible eliminar la reserva.');
        return;
      }
      setReservas((prev) => prev.filter((r) => r.id !== res.id));
      setOcupacion((prev) => {
        const next = { ...prev };
        delete next[claveOcupacion(res.dateStr, res.room, res.block)];
        return next;
      });
      showToast('Reserva cancelada');
    } catch {
      showToast('No fue posible conectar con el servidor. Intenta nuevamente.');
    } finally {
      setEliminandoId(null);
    }
  };

  // Crear Sala (Admin)
  const nextAdminCode = useMemo(() => {
    const prefijo = PREFIJOS_SALA[adminType];
    const existingSame = salas.filter((s) => s.type === adminType);
    const nextNum = existingSame.length + 1;
    return `${prefijo}-${adminFloor}${nextNum.toString().padStart(2, '0')}`;
  }, [adminType, adminFloor, salas]);

  const handleCrearSala = async () => {
    if (!adminName.trim()) {
      setAdminMsg('Escribe un nombre para la sala.');
      return;
    }
    if (salas.some((s) => s.name.toLowerCase() === adminName.trim().toLowerCase())) {
      setAdminMsg('Ya existe una sala con ese nombre.');
      return;
    }

    const nuevaSala: SalaVisual = {
      code: nextAdminCode,
      type: adminType,
      name: adminName.trim(),
      cap: Number(adminCap),
      floor: Number(adminFloor),
    };

    try {
      const resp = await fetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre_descriptivo: nuevaSala.name,
          tipo: nuevaSala.type,
          aforo: nuevaSala.cap,
          piso: nuevaSala.floor,
        }),
      });

      const data = (await resp.json().catch(() => null)) as
        | {
            error?: string;
            id_sala?: string;
            nombre_descriptivo?: string;
            tipo?: TipoSala;
            aforo?: number;
            piso?: number;
          }
        | null;

      if (!resp.ok) {
        setAdminMsg(data?.error || 'No fue posible crear la sala.');
        return;
      }

      const salaCreada: SalaVisual = {
        ...nuevaSala,
        code: data?.id_sala || nuevaSala.code,
        name: data?.nombre_descriptivo || nuevaSala.name,
        type: data?.tipo || nuevaSala.type,
        cap: data?.aforo ?? nuevaSala.cap,
        floor: data?.piso ?? nuevaSala.floor,
      };

      setSalas([...salas, salaCreada]);
      setAdminName('');
      setAdminMsg('');
      showToast(`Sala creada: ${salaCreada.code}`);
      openQrModal(salaCreada);
    } catch {
      setAdminMsg('No fue posible conectar con el servidor. Intenta nuevamente.');
    }
  };

  const openQrModal = async (room: SalaVisual) => {
    try {
      const qrData = `RESERVA-SALAS|${room.code}`;
      const svg = await QRCode.toString(qrData, {
        type: 'svg',
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrModalData({
        room,
        qrSvg: svg,
        code: getManualCode(room.code),
      });
    } catch {
      showToast('Error generando QR');
    }
  };

  // Permisos según Rol detectado
  const userRol = currentUser?.rol || 'alumno';
  const esAdmin = userRol === 'administrador';
  const esEncargado = userRol === 'encargado_administrativo';

  return (
    <div>
      {/* Barra Superior */}
      <header className="top">
        <div className="wrap">
          <div className="bar1">
            <div className="brand cursor-pointer" onClick={() => { setView('reservar'); setStep(0); }}>
              <i></i>Reserva de Salas
            </div>

            <div className="tools">
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <span className="block text-xs font-semibold leading-tight">{currentUser.nombre_completo}</span>
                    <span className="block text-[11px] text-gray-400 capitalize">
                      {currentUser.rol?.replace('_', ' ')}
                    </span>
                  </div>
                  <button
                    className="role text-xs"
                    type="button"
                    onClick={handleLogout}
                    title="Cerrar Sesión"
                  >
                    Salir ✕
                  </button>
                </div>
              ) : (
                <button className="role text-xs font-semibold text-red-600" type="button" onClick={() => setCurrentUser(null)}>
                  Iniciar Sesión
                </button>
              )}

              <button
                className="iconbtn"
                type="button"
                onClick={toggleTheme}
                aria-label="Cambiar tema"
              >
                {theme === 'dark' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Navegación por Pestañas según Rol del Usuario */}
          {currentUser && (
            <nav className="tabs" aria-label="Secciones">
              <button
                type="button"
                onClick={() => { setView('reservar'); setStep(0); }}
                aria-current={view === 'reservar' ? 'page' : undefined}
              >
                Reservar
              </button>

              <button
                type="button"
                onClick={() => setView('mis')}
                aria-current={view === 'mis' || view === 'asist' ? 'page' : undefined}
              >
                Mis reservas
              </button>

              {/* Vista exclusiva Encargado Administrativo */}
              {esEncargado && (
                <button
                  type="button"
                  onClick={() => { setView('reserva-tercero'); setStep(0); }}
                  aria-current={view === 'reserva-tercero' ? 'page' : undefined}
                >
                  🛡️ Reserva para Estudiante
                </button>
              )}

              {/* Vista exclusiva Administrador */}
              {esAdmin && (
                <button
                  type="button"
                  onClick={() => setView('admin')}
                  aria-current={view === 'admin' ? 'page' : undefined}
                >
                  Gestión Salas (Admin)
                </button>
              )}
            </nav>
          )}
        </div>
      </header>

      <div className="wrap">
        {/* ============================================================== */}
        {/* MODAL DE LOGIN SI NO HAY SESIÓN ACTIVA */}
        {/* ============================================================== */}
        {!currentUser && (
          <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-10 px-4">
            <div className="card shadow-lg w-full max-w-md p-8 border border-slate-200/80">
              <div className="text-center mb-6">
                <span className="inline-block bg-red-600 text-white font-extrabold px-3 py-1 rounded text-lg tracking-wider mb-2">
                  INACAP
                </span>
                <h1 className="title" style={{ margin: '4px 0 6px', fontSize: 28 }}>Acceso Institucional</h1>
                <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
                  Portal Integrado de Reservas e Infraestructura
                </p>
              </div>

              <form onSubmit={handleLogin}>
                <label className="label" htmlFor="logId" style={{ marginTop: 0 }}>
                  RUT o Correo Institucional
                </label>
                <input
                  id="logId"
                  className="in"
                  value={loginId}
                  onChange={(e) => setLoginId(formatearIdentificadorLogin(e.target.value))}
                  placeholder="Ej: 12.345.678-5 o alumno@inacapmail.cl"
                  autoComplete="username"
                  required
                />

                <label className="label" htmlFor="logPass">
                  Contraseña
                </label>
                <input
                  id="logPass"
                  type="password"
                  className="in"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder="••••••••"
                  required
                />

                {loginError && <p className="msg" role="alert">{loginError}</p>}

                <button
                  className="btn primary"
                  type="submit"
                  style={{ width: '100%', marginTop: 18, height: 48, fontSize: 16 }}
                  disabled={loginLoading}
                >
                  {loginLoading ? 'Verificando en Padrón...' : 'Ingresar al Sistema'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* VISTAS PARA USUARIO AUTENTICADO */}
        {/* ============================================================== */}
        {currentUser && (
          <>
            {/* ============================================================== */}
            {/* VISTA: RESERVA PARA ESTUDIANTES (ENCARGADO ADMINISTRATIVO) */}
            {/* ============================================================== */}
            {view === 'reserva-tercero' && esEncargado && (
              <div style={{ marginTop: 20 }}>
                <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--accent)' }}>
                  <h2 className="title" style={{ margin: 0 }}>🛡️ Reserva Asistida para Estudiante</h2>
                  <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 14px' }}>
                    Módulo presencial para que el Encargado Administrativo (<b>{currentUser.nombre_completo}</b>) asigne una sala en nombre de un estudiante. El registro se almacenará en la bitácora administrativa de auditoría.
                  </p>

                  <label className="label" htmlFor="rut_tercero" style={{ marginTop: 0 }}>
                    RUT del Estudiante Beneficiario
                  </label>
                  <div className="field">
                    <input
                      id="rut_tercero"
                      className="in"
                      value={estudianteRut}
                      onChange={(e) => {
                        setEstudianteRut(fmtRut(e.target.value));
                        setEstudianteMsg('');
                      }}
                      placeholder="12.345.678-5"
                      maxLength={12}
                    />
                    <button className="btn primary" type="button" onClick={handleValidarEstudianteTercero}>
                      Verificar Estudiante
                    </button>
                  </div>
                  {estudianteMsg && (
                    <p style={{ fontSize: 13, marginTop: 6, fontWeight: 500, color: estudianteValido ? 'var(--ok)' : 'var(--err)' }}>
                      {estudianteMsg}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* WIZARD DE RESERVA (4 PASOS) */}
            {/* ============================================================== */}
            {(view === 'reservar' || view === 'reserva-tercero') && (
              <div>
                {step <= 3 && (
                  <ol className="steps" aria-label="Progreso">
                    {['Espacio', 'Horario', 'Sala', 'Asistentes'].map((label, idx) => {
                      const isDone = step > idx;
                      const isCur = step === idx;
                      return (
                        <li key={label} className={isDone ? 'done' : isCur ? 'cur' : ''}>
                          <button
                            type="button"
                            onClick={() => setStep(idx)}
                            disabled={idx > step}
                            aria-current={isCur ? 'step' : undefined}
                          >
                            <b>{idx + 1}</b>
                            {label}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}

                <div className="main">
                  <div>
                    {/* Panel 0: Tipo de Espacio */}
                    {step === 0 && (
                      <section className="panel on">
                        <span className="label">Tipo de espacio</span>
                        <div className="types">
                          {TIPOS.map((x) => (
                            <button
                              key={x.id}
                              type="button"
                              className="type"
                              style={{ '--c': x.c } as React.CSSProperties}
                              aria-pressed={selectedType === x.id}
                              onClick={() => handleSelectType(x.id)}
                            >
                              <span className="tag">{x.code}</span>
                              <strong>{x.name}</strong>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Panel 1: Horario (Días y Bloques 0-13) */}
                    {step === 1 && (
                      <section className="panel on">
                        <span className="label">Día</span>
                        <div className="days-nav">
                          <button type="button" className="week-nav" aria-label="Semana anterior" disabled={weekStartIdx === 0} onClick={() => setWeekStartIdx(Math.max(0, weekStartIdx - 7))}>‹</button>
                          <div className="days">
                          {visibleDays.map((d, visibleIdx) => {
                            const i = weekStartIdx + visibleIdx;
                            const domingo = d.getDay() === 0;
                            const diaSem = d
                              .toLocaleDateString('es-CL', { weekday: 'short' })
                              .replace('.', '');
                            return (
                              <button
                                key={i}
                                type="button"
                                className="day"
                                aria-pressed={selectedDayIdx === i}
                                disabled={domingo}
                                onClick={() => {
                                  setSelectedDayIdx(i);
                                  setSelectedBlock(null);
                                }}
                              >
                                <small>{diaSem}</small>
                                <b className="num">{d.getDate()}</b>
                              </button>
                            );
                          })}
                          </div>
                          <button type="button" className="week-nav" aria-label="Semana siguiente" disabled={weekStartIdx + 7 >= days.length} onClick={() => setWeekStartIdx(weekStartIdx + 7)}>›</button>
                        </div>

                        {ocupacionCargando && (
                          <p className="center" style={{ color: 'var(--muted)', margin: '0 0 12px' }}>
                            Cargando disponibilidad…
                          </p>
                        )}
                        {GRUPOS.map(([name, start, end]) => (
                          <div key={name} className="group">
                            <h3>{name}</h3>
                            <div className="blocks">
                              {Array.from({ length: end - start + 1 }, (_, k) => start + k).map(
                                (blk) => {
                                  const bInfo = BLOQUES_HORARIOS[blk];
                                  const day = days[selectedDayIdx];
                                  const hayLibres = salas.some(
                                    (r) => r.type === selectedType && isRoomFree(r, day, blk)
                                  );
                                  return (
                                    <button
                                      key={blk}
                                      type="button"
                                      className="blk"
                                      aria-pressed={selectedBlock === blk}
                                      disabled={ocupacionCargando || !hayLibres}
                                      onClick={() => handleSelectBlock(blk)}
                                    >
                                      {bInfo.inicio} – {bInfo.fin}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        ))}
                      </section>
                    )}

                    {/* Panel 2: Salas Disponibles */}
                    {step === 2 && (
                      <section className="panel on">
                        <span className="label">Salas disponibles</span>
                        {freeRooms.length > 0 ? (
                          <div className="rooms">
                            {freeRooms.map((r) => {
                              const tDef = TIPOS.find((t) => t.id === r.type);
                              return (
                                <button
                                  key={r.code}
                                  type="button"
                                  className="room"
                                  style={{ '--c': tDef?.c } as React.CSSProperties}
                                  aria-pressed={selectedRoomCode === r.code}
                                  onClick={() => handleSelectRoom(r.code)}
                                >
                                  <span className="tag">{r.code}</span>
                                  <h3>{r.name}</h3>
                                  <p className="num">
                                    {r.cap} personas · Piso {r.floor}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="empty">No quedan salas libres a esta hora.</div>
                        )}
                      </section>
                    )}

                    {/* Panel 3: Asistentes y Motivo */}
                    {step === 3 && (
                      <section className="panel on">
                        <label className="label" htmlFor="rut_asistente" style={{ marginTop: 20 }}>
                          RUT de asistentes institucionales
                        </label>
                        <div className="field">
                          <input
                            id="rut_asistente"
                            value={rutInput}
                            onChange={(e) => {
                              setRutInput(fmtRut(e.target.value));
                              setRutMsg('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddRut();
                              }
                            }}
                            autoComplete="off"
                            placeholder="12.345.678-5"
                            maxLength={12}
                            className={`in ${rutMsg ? 'bad' : ''}`}
                            disabled={validatingRut}
                          />
                          <button className="btn" type="button" onClick={handleAddRut} disabled={validatingRut}>
                            {validatingRut ? 'Validando...' : 'Agregar'}
                          </button>
                        </div>
                        {rutMsg && <p className="msg" role="alert">{rutMsg}</p>}

                        <ul className="chips">
                          <li className="chip me">
                            {view === 'reserva-tercero' && estudianteValido
                              ? `Estudiante: ${estudianteValido.nombre_completo}`
                              : `Titular: ${currentUser.nombre_completo}`}
                          </li>
                          {attendees.map((rut, i) => (
                            <li key={i} className="chip">
                              {rut}
                              <button
                                type="button"
                                onClick={() => handleRemoveRut(i)}
                                aria-label={`Quitar ${rut}`}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>

                        {selectedRoom && (
                          <p className="count num">
                            {attendees.length + 1} / {selectedRoom.cap} personas permitidas
                          </p>
                        )}

                        <span className="label">Motivo de reserva</span>
                        <div className="row">
                          {PURPOSES.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="pill"
                              aria-pressed={selectedPurpose === p}
                              onClick={() => setSelectedPurpose(p)}
                            >
                              {p}
                            </button>
                          ))}
                        </div>

                        <label className="label" htmlFor="detail">
                          Detalle <small>Opcional</small>
                        </label>
                        <textarea
                          id="detail"
                          maxLength={100}
                          value={detail}
                          onChange={(e) => setDetail(e.target.value)}
                          placeholder="Ej: Preparación de proyecto de título / Taller práctico"
                        />
                      </section>
                    )}

                    {/* Panel 4: Reserva Confirmada */}
                    {step === 4 && lastBooking && (
                      <section className="panel on">
                        <div className="card" style={{ marginTop: 20 }}>
                          <div className="ticks">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          </div>
                          <h2 className="title">Reserva confirmada</h2>
                          <dl className="facts">
                            <div>
                              <dt>Código</dt>
                              <dd className="num font-bold text-red-600">{lastBooking.code}</dd>
                            </div>
                            <div>
                              <dt>Titular</dt>
                              <dd>{lastBooking.userRut}</dd>
                            </div>
                            <div>
                              <dt>Sala</dt>
                              <dd>{salas.find((s) => s.code === lastBooking.room)?.name} · {lastBooking.room}</dd>
                            </div>
                            <div>
                              <dt>Horario</dt>
                              <dd className="num">
                                {lastBooking.dateStr} · {BLOQUES_HORARIOS[lastBooking.block].inicio} – {BLOQUES_HORARIOS[lastBooking.block].fin}
                              </dd>
                            </div>
                          </dl>

                          <div className="msgcard">
                            Tu reserva está lista. Al llegar a la sala, escanea el código QR o ingresa el código manual de 6 dígitos para registrar tu asistencia.
                          </div>

                          <div className="row">
                            <button
                              className="btn primary"
                              type="button"
                              onClick={() => openAsistencia(lastBooking)}
                            >
                              Confirmar asistencia (QR)
                            </button>
                            <button className="btn" type="button" onClick={resetFlow}>
                              Nueva reserva
                            </button>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Barra Inferior Sticky */}
                    {step >= 1 && step <= 3 && (
                      <div className="bar">
                        <div className="in2">
                          <button className="btn" type="button" onClick={() => setStep(step - 1)}>
                            Atrás
                          </button>
                          <p>
                            {step === 1 && selectedType && TIPOS.find((t) => t.id === selectedType)?.name}
                            {step === 2 && selectedBlock !== null && `${days[selectedDayIdx].toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${BLOQUES_HORARIOS[selectedBlock].inicio}`}
                            {step === 3 && selectedRoom && `${selectedRoom.name} · ${BLOQUES_HORARIOS[selectedBlock!].inicio}`}
                          </p>
                          {step === 3 && (
                            <button
                              className="btn primary"
                              type="button"
                              disabled={!selectedPurpose}
                              onClick={handleConfirmReserva}
                            >
                              Confirmar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Aside Resumen Lateral */}
                  <aside className="sum" aria-label="Resumen">
                    <dl>
                      {view === 'reserva-tercero' && (
                        <div>
                          <dt>Estudiante</dt>
                          <dd className={estudianteValido ? '' : 'e'}>
                            {estudianteValido ? estudianteValido.nombre_completo : 'Pendiente'}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>Espacio</dt>
                        <dd className={selectedType ? '' : 'e'}>
                          {selectedType ? TIPOS.find((t) => t.id === selectedType)?.name : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Horario</dt>
                        <dd className={selectedBlock !== null ? '' : 'e'}>
                          {selectedBlock !== null
                            ? `${days[selectedDayIdx].toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })} · ${BLOQUES_HORARIOS[selectedBlock].inicio} – ${BLOQUES_HORARIOS[selectedBlock].fin}`
                            : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>Sala</dt>
                        <dd className={selectedRoom ? '' : 'e'}>
                          {selectedRoom ? `${selectedRoom.name} · ${selectedRoom.code}` : '—'}
                        </dd>
                      </div>
                    </dl>
                  </aside>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA: MIS RESERVAS */}
            {/* ============================================================== */}
            {view === 'mis' && (
              <div>
                <h1 className="title">Mis reservas</h1>
                <ul className="list" style={{ marginTop: 16, paddingBottom: 32 }}>
                  {reservas.length > 0 ? (
                    reservas.map((r) => {
                      const room = salas.find((s) => s.code === r.room);
                      const tDef = TIPOS.find((t) => t.id === room?.type);
                      return (
                        <li key={r.id} className="item">
                          <div>
                            <h3>
                              {room?.name || r.room}{' '}
                              <span className="tag" style={{ '--c': tDef?.c, marginLeft: 6 } as React.CSSProperties}>
                                {r.room}
                              </span>
                            </h3>
                            <p className="num">
                              {r.dateStr} · {BLOQUES_HORARIOS[r.block]?.inicio} – {BLOQUES_HORARIOS[r.block]?.fin} · Código: <b>{r.code}</b>
                            </p>
                            {r.attended ? (
                              <span className="state ok num">
                                Asistencia registrada {new Date(r.attended).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="state">Por confirmar</span>
                            )}
                          </div>
                          {!r.attended && (
                            <div className="row" style={{ gap: 8 }}>
                              <button
                                className="btn sm primary"
                                type="button"
                                onClick={() => openAsistencia(r)}
                              >
                                Confirmar asistencia
                              </button>
                              <button
                                className="btn sm"
                                type="button"
                                onClick={() => abrirEdicion(r)}
                              >
                                Editar
                              </button>
                              <button
                                className="btn sm danger"
                                type="button"
                                disabled={eliminandoId === r.id}
                                onClick={() => eliminarReserva(r)}
                              >
                                {eliminandoId === r.id ? 'Cancelando…' : 'Cancelar reserva'}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <li className="empty">Aún no tienes reservas registradas.</li>
                  )}
                </ul>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA: ASISTENCIA (CHECK-IN QR / MANUAL) */}
            {/* ============================================================== */}
            {view === 'asist' && asistenciaReserva && (
              <div>
                <button className="back" type="button" onClick={() => setView('mis')}>
                  ← Volver a Mis reservas
                </button>
                <div style={{ maxWidth: 420, margin: '0 auto', paddingBottom: 32 }}>
                  <h1 className="title center">
                    {salas.find((s) => s.code === asistenciaReserva.room)?.name || asistenciaReserva.room}
                  </h1>
                  <p className="center" style={{ margin: 0, color: 'var(--muted)' }}>
                    {asistenciaReserva.dateStr} · {BLOQUES_HORARIOS[asistenciaReserva.block]?.inicio} – {BLOQUES_HORARIOS[asistenciaReserva.block]?.fin}
                  </p>

                  {asistModo === 'scan' && (
                    <div>
                      <div className={`scan ${scanning ? 'go' : ''}`}>
                        <i></i><i></i><i></i><i></i>
                        <span>Apunta la cámara al código QR de la sala</span>
                      </div>
                      <button
                        className="btn primary"
                        type="button"
                        style={{ width: '100%' }}
                        onClick={handleSimularScan}
                        disabled={scanning}
                      >
                        {scanning ? 'Escaneando...' : 'Escanear QR'}
                      </button>
                      <p className="center" style={{ margin: '14px 0 0' }}>
                        <button
                          className="pill dash"
                          type="button"
                          onClick={() => setAsistModo('manual')}
                        >
                          No puedo usar la cámara
                        </button>
                      </p>
                    </div>
                  )}

                  {asistModo === 'manual' && (
                    <div>
                      <label className="label" htmlFor="mcode">
                        Código de 6 dígitos de la sala
                      </label>
                      <div className="field">
                        <input
                          id="mcode"
                          className="num"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="000000"
                          autoComplete="off"
                          value={manualCodeInput}
                          onChange={(e) => {
                            setManualCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6));
                            setManualCodeError('');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleManualCodeSubmit();
                          }}
                        />
                        <button className="btn primary" type="button" onClick={handleManualCodeSubmit}>
                          Confirmar
                        </button>
                      </div>
                      {manualCodeError && (
                        <p className="msg" role="alert">
                          {manualCodeError}
                        </p>
                      )}
                      <p className="center" style={{ margin: '6px 0 0' }}>
                        <button
                          className="pill dash"
                          type="button"
                          onClick={() => setAsistModo('scan')}
                        >
                          Usar la cámara
                        </button>
                      </p>
                      <p className="hint">
                        Código de prueba de esta sala: <b>{getManualCode(asistenciaReserva.room)}</b>
                      </p>
                    </div>
                  )}

                  {asistModo === 'ok' && (
                    <div className="card center">
                      <div className="ticks" style={{ margin: '0 auto 10px' }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </div>
                      <h2 className="title">Asistencia confirmada</h2>
                      <p style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
                        Tu asistencia quedó registrada.
                      </p>
                      <button className="btn primary" type="button" onClick={() => setView('mis')}>
                        Listo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* VISTA: ADMIN - GESTIÓN Y CREACIÓN DE SALAS */}
            {/* ============================================================== */}
            {view === 'admin' && esAdmin && (
              <div>
                <h1 className="title">Gestión de Salas e Infraestructura</h1>
                <div className="admin" style={{ marginTop: 12 }}>
                  <section className="card">
                    <span className="label" style={{ marginTop: 0 }}>Tipo de Sala</span>
                    <div className="row">
                      {TIPOS.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="pill"
                          aria-pressed={adminType === t.id}
                          onClick={() => {
                            setAdminType(t.id);
                            setAdminCap(t.cap);
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>

                    <label className="label" htmlFor="adName">
                      Nombre descriptivo
                    </label>
                    <input
                      id="adName"
                      className="in"
                      value={adminName}
                      onChange={(e) => {
                        setAdminName(e.target.value);
                        setAdminMsg('');
                      }}
                      autoComplete="off"
                      maxLength={28}
                      placeholder="Ej: Sala Mistral"
                    />

                    <div className="row" style={{ marginTop: 8 }}>
                      {TIPOS.find((t) => t.id === adminType)
                        ?.sug.filter((s) => !salas.some((r) => r.name === s))
                        .map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="pill dash"
                            onClick={() => {
                              setAdminName(s);
                              setAdminMsg('');
                            }}
                          >
                            {s}
                          </button>
                        ))}
                    </div>

                    <div className="fgrid">
                      <div>
                        <label className="label" htmlFor="adCap">
                          Capacidad
                        </label>
                        <input
                          id="adCap"
                          type="number"
                          min={1}
                          max={300}
                          inputMode="numeric"
                          value={adminCap}
                          onChange={(e) => setAdminCap(Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="label" htmlFor="adFloor">
                          Piso (1 - 9)
                        </label>
                        <input
                          id="adFloor"
                          type="number"
                          min={1}
                          max={9}
                          inputMode="numeric"
                          value={adminFloor}
                          onChange={(e) => setAdminFloor(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <p className="prev">
                      Sigla autogenerada: <b className="num">{nextAdminCode}</b>
                    </p>
                    {adminMsg && <p className="msg" role="alert" style={{ margin: '-6px 0 8px' }}>{adminMsg}</p>}

                    <button
                      className="btn primary"
                      type="button"
                      style={{ width: '100%' }}
                      onClick={handleCrearSala}
                    >
                      Crear sala
                    </button>
                  </section>

                  {/* Catálogo de Salas */}
                  <section>
                    <div className="list">
                      {TIPOS.map((t) => {
                        const salasTipo = salas.filter((s) => s.type === t.id);
                        if (salasTipo.length === 0) return null;
                        return (
                          <div key={t.id} style={{ marginBottom: 14 }}>
                            <span className="label" style={{ margin: '14px 0 6px' }}>
                              {t.name}
                            </span>
                            {salasTipo.map((r) => (
                              <div key={r.code} className="rrow" style={{ marginBottom: 8 }}>
                                <span className="tag" style={{ '--c': t.c } as React.CSSProperties}>
                                  {r.code}
                                </span>
                                <div>
                                  <strong>{r.name}</strong>
                                  <span className="num">
                                    {r.cap} personas · Piso {r.floor}
                                  </span>
                                </div>
                                <button
                                  className="btn sm"
                                  type="button"
                                  onClick={() => openQrModal(r)}
                                >
                                  QR
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal QR */}
      {qrModalData && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalData(null);
          }}
        >
          <div className="card">
            <h2 className="title" style={{ margin: 0 }}>
              {qrModalData.room.name}
            </h2>
            <span className="tag" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              {qrModalData.room.code}
            </span>

            <div
              className="qr"
              dangerouslySetInnerHTML={{ __html: qrModalData.qrSvg }}
            />

            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              Código manual de asistencia
            </p>
            <div className="code num">{qrModalData.code}</div>

            <div>
              <button
                className="btn"
                type="button"
                style={{ width: '100%' }}
                onClick={() => setQrModalData(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar reserva */}
      {editando && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !editGuardando) cerrarEdicion();
          }}
        >
          <div className="card" style={{ maxWidth: 480, width: '100%' }}>
            <h2 className="title" style={{ margin: '0 0 4px' }}>
              Editar reserva {editando.code}
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--muted)', fontSize: 13 }}>
              {salas.find((s) => s.code === editando.room)?.name || editando.room} · {editando.room}
            </p>

            <label className="label" htmlFor="editFecha">Fecha</label>
            <div className="field">
              <input
                id="editFecha"
                type="date"
                className="in"
                value={editFecha}
                min={toLocalDateStr(new Date())}
                max={toLocalDateStr(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0))}
                onChange={(e) => setEditFecha(e.target.value)}
              />
            </div>
            <p className="hint" style={{ margin: '2px 0 8px' }}>
              Solo se puede agendar dentro del mes en curso.
            </p>

            <label className="label" htmlFor="editBloque">
              Horario {editCargando ? '(cargando disponibilidad…)' : ''}
            </label>
            <div className="field">
              <select
                id="editBloque"
                className="in"
                value={editBloque ?? ''}
                onChange={(e) => setEditBloque(e.target.value === '' ? null : Number(e.target.value))}
                disabled={editCargando}
              >
                {editBloque === null && <option value="">Selecciona un horario</option>}
                {Object.entries(BLOQUES_HORARIOS).map(([n, info]) => {
                  const blk = Number(n);
                  const ocupado = !!editOcupacion[claveOcupacion(editFecha, editando.room, blk)];
                  return (
                    <option key={n} value={blk} disabled={ocupado}>
                      {info.inicio} – {info.fin}{ocupado ? ' (ocupado)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <label className="label" htmlFor="editAsistentes">Cantidad de asistentes</label>
            <div className="field">
              <input
                id="editAsistentes"
                type="number"
                className="in"
                min={1}
                max={(salas.find((s) => s.code === editando.room)?.cap ?? 31) - 1}
                value={editAsistentes}
                onChange={(e) => setEditAsistentes(Number(e.target.value))}
              />
            </div>

            <label className="label" htmlFor="editProposito">Propósito</label>
            <div className="field">
              <input
                id="editProposito"
                type="text"
                className="in"
                maxLength={100}
                value={editProposito}
                onChange={(e) => setEditProposito(e.target.value)}
              />
            </div>

            {editError && <p className="msg" role="alert">{editError}</p>}

            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn primary"
                type="button"
                onClick={guardarEdicion}
                disabled={editGuardando || editCargando || editBloque === null || !editFecha}
              >
                {editGuardando ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                className="btn"
                type="button"
                onClick={cerrarEdicion}
                disabled={editGuardando}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
