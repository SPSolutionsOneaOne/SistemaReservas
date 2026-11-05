// ============================================================
// Hook: useSalas — CRUD y consultas sobre public.salas
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { Sala, SalaUpdate, TipoSala, EstadoHabilitacion } from '@/types/database';
import { getSupabaseReservas } from '@/lib/supabaseReservas';

interface UseSalasOptions {
  tipo?: TipoSala;
  piso?: number;
  estado?: EstadoHabilitacion;
}

interface UseSalasReturn {
  salas: Sala[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  actualizarSala: (idSala: string, datos: SalaUpdate) => Promise<Sala | null>;
  eliminarSala: (idSala: string) => Promise<boolean>;
}

/**
 * Hook de React para gestionar salas desde DB-Reservas.
 * Soporta filtros opcionales por tipo, piso y estado.
 */
export function useSalas(options?: UseSalasOptions): UseSalasReturn {
  const [salas, setSalas] = useState<Sala[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSalas = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseReservas();
      let query = supabase.from('salas').select('*');

      if (options?.tipo) {
        query = query.eq('tipo', options.tipo);
      }
      if (options?.piso) {
        query = query.eq('piso', options.piso);
      }
      if (options?.estado) {
        query = query.eq('estado_habilitacion', options.estado);
      }

      const { data, error: dbError } = await query.order('id_sala', { ascending: true });

      if (dbError) throw new Error(dbError.message);
      setSalas((data as Sala[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar salas');
    } finally {
      setLoading(false);
    }
  }, [options?.tipo, options?.piso, options?.estado]);

  useEffect(() => {
    fetchSalas();
  }, [fetchSalas]);

  const actualizarSala = async (
    idSala: string,
    datos: SalaUpdate
  ): Promise<Sala | null> => {
    const supabase = getSupabaseReservas();
    const { data, error: dbError } = await supabase
      .from('salas')
      .update(datos)
      .eq('id_sala', idSala)
      .select()
      .single();

    if (dbError) {
      setError(dbError.message);
      return null;
    }

    await fetchSalas();
    return data as Sala;
  };

  const eliminarSala = async (idSala: string): Promise<boolean> => {
    const supabase = getSupabaseReservas();
    const { error: dbError } = await supabase
      .from('salas')
      .delete()
      .eq('id_sala', idSala);

    if (dbError) {
      setError(dbError.message);
      return false;
    }

    await fetchSalas();
    return true;
  };

  return { salas, loading, error, refetch: fetchSalas, actualizarSala, eliminarSala };
}

export default useSalas;
