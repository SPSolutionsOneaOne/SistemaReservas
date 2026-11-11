// ============================================================
// SalaFactory — Patrón Factory Method (RF-FUN-12)
// Genera instancias de Sala con sigla incremental formato 'AAA-00'
// El prefijo ya no es estático: se lee de public.tipos_sala.
// ============================================================

import type { Sala, SalaInsert, TipoSala } from '@/types/database';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';

/**
 * Factory Method para la creación de Salas.
 * Genera automáticamente el `id_sala` con formato 'AAA-00' según el tipo.
 *
 * Ejemplo:
 *   tipo='lab' → busca último LAB-XX → genera LAB-(XX+1)
 *   El prefijo proviene de tipos_sala.prefijo; si el tipo no existe,
 *   se deriva de las primeras letras del slug en mayúscula.
 */
export class SalaFactory {
  /** Prefijo del tipo desde la BD; fallback derivado del slug. */
  static async generarPrefijo(tipo: TipoSala): Promise<string> {
    const supabase = getSupabaseReservasAdmin();
    const { data, error } = await supabase
      .from('tipos_sala')
      .select('prefijo')
      .eq('id', tipo)
      .maybeSingle();

    if (error) {
      console.error(`[SalaFactory] Error consultando tipos_sala para '${tipo}': ${error.message}`);
    }

    const prefijo = data?.prefijo as string | undefined;
    if (prefijo && /^[A-Z]{2,5}$/.test(prefijo)) return prefijo;

    const derivado = String(tipo)
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 3)
      .padEnd(3, 'X');
    return derivado;
  }

  /**
   * Genera el siguiente id_sala disponible para el tipo dado.
   * Consulta la DB para obtener el último ID y lo incrementa.
   */
  static async generarIdSala(tipo: TipoSala): Promise<string> {
    const prefijo = await this.generarPrefijo(tipo);
    const supabase = getSupabaseReservasAdmin();

    // Buscar la última sala de este tipo ordenada descendente
    const { data, error } = await supabase
      .from('salas')
      .select('id_sala')
      .like('id_sala', `${prefijo}-%`)
      .order('id_sala', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`[SalaFactory] Error al consultar salas: ${error.message}`);
    }

    let siguienteNumero = 1;

    if (data && data.length > 0) {
      const ultimoId = data[0].id_sala; // Ej: 'LAB-05'
      const partes = ultimoId.split('-');
      const ultimoNumero = parseInt(partes[1], 10);
      if (Number.isFinite(ultimoNumero)) siguienteNumero = ultimoNumero + 1;
    }

    return `${prefijo}-${siguienteNumero.toString().padStart(2, '0')}`;
  }

  /**
   * Crea una nueva sala con id autogenerado.
   * @returns La sala insertada completa.
   */
  static async crearSala(
    params: Omit<SalaInsert, 'id_sala'>
  ): Promise<Sala> {
    const supabase = getSupabaseReservasAdmin();
    const idSala = await this.generarIdSala(params.tipo);

    const nuevaSala: SalaInsert = {
      id_sala: idSala,
      ...params,
    };

    const { data, error } = await supabase
      .from('salas')
      .insert(nuevaSala)
      .select()
      .single();

    if (error) {
      throw new Error(`[SalaFactory] Error al crear sala: ${error.message}`);
    }

    return data as Sala;
  }
}

export default SalaFactory;
