// ============================================================
// Hook: useReservas — CRUD y validaciones sobre public.reservas
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { Reserva, ReservaInsert, ReservaUpdate } from '@/types/database';
import { getSupabaseReservas } from '@/lib/supabaseReservas';

interface UseReservasOptions {
  /** Filtrar por sala específica */
  idSala?: string;
  /** Filtrar por RUT del titular */
  usuarioRut?: string;
  /** Filtrar por fecha (ISO 'YYYY-MM-DD') */
  fecha?: string;
}

interface UseReservasReturn {
  reservas: Reserva[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  crearReserva: (reserva: ReservaInsert) => Promise<Reserva | null>;
  cancelarReserva: (idReserva: string) => Promise<boolean>;
  registrarAsistencia: (idReserva: string) => Promise<boolean>;
}

/**
 * Hook de React para gestionar reservas desde DB-Reservas.
 * Maneja errores 409 (conflicto de concurrencia por UNIQUE constraint).
 */
export function useReservas(options?: UseReservasOptions): UseReservasReturn {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReservas = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseReservas();
      let query = supabase.from('reservas').select('*');

      if (options?.idSala) {
        query = query.eq('id_sala', options.idSala);
      }
      if (options?.usuarioRut) {
        query = query.eq('usuario_rut', options.usuarioRut);
      }
      if (options?.fecha) {
        query = query.eq('fecha', options.fecha);
      }

      const { data, error: dbError } = await query.order('fecha', { ascending: true });

      if (dbError) throw new Error(dbError.message);
      setReservas((data as Reserva[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reservas');
    } finally {
      setLoading(false);
    }
  }, [options?.idSala, options?.usuarioRut, options?.fecha]);

  useEffect(() => {
    fetchReservas();
  }, [fetchReservas]);

  /**
   * Crea una nueva reserva.
   * Captura error UNIQUE(id_sala, fecha, bloque_horario) → devuelve error 409.
   */
  const crearReserva = async (
    reserva: ReservaInsert
  ): Promise<Reserva | null> => {
    const supabase = getSupabaseReservas();

    const { data, error: dbError } = await supabase
      .from('reservas')
      .insert(reserva)
      .select()
      .single();

    if (dbError) {
      // Detectar violación de UNIQUE constraint (solape de horario)
      if (dbError.code === '23505') {
        setError(
          'Conflicto de horario: este bloque ya está reservado para esta sala y fecha (HTTP 409).'
        );
      } else {
        setError(dbError.message);
      }
      return null;
    }

    await fetchReservas();
    return data as Reserva;
  };

  /** Cancela una reserva cambiando su estado a 'cancelada'. */
  const cancelarReserva = async (idReserva: string): Promise<boolean> => {
    const supabase = getSupabaseReservas();
    const update: ReservaUpdate = { estado: 'cancelada' };

    const { error: dbError } = await supabase
      .from('reservas')
      .update(update)
      .eq('id_reserva', idReserva);

    if (dbError) {
      setError(dbError.message);
      return false;
    }

    await fetchReservas();
    return true;
  };

  /** Registra la asistencia (check-in) con timestamp actual. */
  const registrarAsistencia = async (idReserva: string): Promise<boolean> => {
    const supabase = getSupabaseReservas();

    const { error: dbError } = await supabase
      .from('reservas')
      .update({
        asistencia_registrada_en: new Date().toISOString(),
        estado: 'completada',
      } satisfies ReservaUpdate)
      .eq('id_reserva', idReserva);

    if (dbError) {
      setError(dbError.message);
      return false;
    }

    await fetchReservas();
    return true;
  };

  return {
    reservas,
    loading,
    error,
    refetch: fetchReservas,
    crearReserva,
    cancelarReserva,
    registrarAsistencia,
  };
}

export default useReservas;
