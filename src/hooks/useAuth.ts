// ============================================================
// Hook: useAuth — Autenticación contra DB-Institucional
// Validación de RUT, correo institucional y estado de penalización
// ============================================================

import { useState, useCallback } from 'react';
import type { UsuarioInstitucion } from '@/types/database';
import type { HistorialPenalizacion } from '@/types/database';
import { getSupabaseInstitucional } from '@/lib/supabaseInstitucional';
import { getSupabaseReservas } from '@/lib/supabaseReservas';
import { validarRutChileno, validarCorreoInstitucional } from '@/lib/validators';

interface UseAuthReturn {
  usuario: UsuarioInstitucion | null;
  penalizacion: HistorialPenalizacion | null;
  loading: boolean;
  error: string | null;
  estaBloqueado: boolean;
  buscarUsuarioPorRut: (rut: string) => Promise<UsuarioInstitucion | null>;
  verificarPenalizacion: (rut: string) => Promise<HistorialPenalizacion | null>;
  validarAcceso: (rut: string) => Promise<{ permitido: boolean; razon?: string }>;
}

/**
 * Hook de autenticación cruzada entre DB-Institucional y DB-Reservas.
 * 1. Valida RUT en DB-Institucional (usuarios_institucion)
 * 2. Verifica penalizaciones en DB-Reservas (historial_penalizaciones)
 */
export function useAuth(): UseAuthReturn {
  const [usuario, setUsuario] = useState<UsuarioInstitucion | null>(null);
  const [penalizacion, setPenalizacion] = useState<HistorialPenalizacion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estaBloqueado, setEstaBloqueado] = useState(false);

  /** Busca un usuario por RUT en DB-Institucional */
  const buscarUsuarioPorRut = useCallback(
    async (rut: string): Promise<UsuarioInstitucion | null> => {
      // Validar formato de RUT
      if (!validarRutChileno(rut)) {
        setError('Formato de RUT inválido');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const supabase = getSupabaseInstitucional();
        const { data, error: dbError } = await supabase
          .from('usuarios_institucion')
          .select('*')
          .eq('rut', rut)
          .single();

        if (dbError) {
          if (dbError.code === 'PGRST116') {
            setError('Usuario no encontrado en el padrón institucional');
            return null;
          }
          throw new Error(dbError.message);
        }

        const user = data as UsuarioInstitucion;

        // Validar correo institucional (RN04)
        if (!validarCorreoInstitucional(user.correo_institucional)) {
          setError('El correo del usuario no pertenece a un dominio institucional válido');
          return null;
        }

        // Validar estado activo
        if (!user.estado_activo) {
          setError('El usuario se encuentra desactivado en el sistema');
          return null;
        }

        setUsuario(user);
        return user;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al buscar usuario');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /** Verifica penalizaciones en DB-Reservas */
  const verificarPenalizacion = useCallback(
    async (rut: string): Promise<HistorialPenalizacion | null> => {
      try {
        const supabase = getSupabaseReservas();
        const { data, error: dbError } = await supabase
          .from('historial_penalizaciones')
          .select('*')
          .eq('usuario_rut', rut)
          .single();

        if (dbError) {
          if (dbError.code === 'PGRST116') {
            // No tiene historial, no está penalizado
            setPenalizacion(null);
            setEstaBloqueado(false);
            return null;
          }
          throw new Error(dbError.message);
        }

        const penal = data as HistorialPenalizacion;
        setPenalizacion(penal);

        // Verificar si el bloqueo sigue vigente
        if (penal.bloqueado_hasta) {
          const ahora = new Date();
          const bloqueadoHasta = new Date(penal.bloqueado_hasta);
          setEstaBloqueado(ahora < bloqueadoHasta);
        } else {
          setEstaBloqueado(false);
        }

        return penal;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al verificar penalización');
        return null;
      }
    },
    []
  );

  /**
   * Validación completa de acceso:
   * 1. Busca usuario en DB-Institucional
   * 2. Verifica penalización en DB-Reservas
   * 3. Retorna si tiene permiso para reservar
   */
  const validarAcceso = useCallback(
    async (rut: string): Promise<{ permitido: boolean; razon?: string }> => {
      setLoading(true);

      // Paso 1: Verificar existencia en padrón institucional
      const user = await buscarUsuarioPorRut(rut);
      if (!user) {
        setLoading(false);
        return { permitido: false, razon: error ?? 'Usuario no encontrado' };
      }

      // Paso 2: Verificar penalizaciones
      const penal = await verificarPenalizacion(rut);
      if (penal?.bloqueado_hasta) {
        const ahora = new Date();
        const bloqueadoHasta = new Date(penal.bloqueado_hasta);
        if (ahora < bloqueadoHasta) {
          setLoading(false);
          return {
            permitido: false,
            razon: `Usuario bloqueado hasta ${bloqueadoHasta.toLocaleDateString('es-CL')} por ${penal.ausencias_acumuladas} ausencias acumuladas.`,
          };
        }
      }

      setLoading(false);
      return { permitido: true };
    },
    [buscarUsuarioPorRut, verificarPenalizacion, error]
  );

  return {
    usuario,
    penalizacion,
    loading,
    error,
    estaBloqueado,
    buscarUsuarioPorRut,
    verificarPenalizacion,
    validarAcceso,
  };
}

export default useAuth;
