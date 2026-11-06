// ============================================================
// SalaFactory — Patrón Factory Method (RF-FUN-12)
// Genera instancias de Sala con sigla incremental formato 'AAA-00'
// ============================================================

import type { Sala, SalaInsert, TipoSala } from '@/types/database';
import { PREFIJOS_SALA } from '@/types/database';
import { getSupabaseReservasAdmin } from '@/lib/supabaseReservasAdmin';

/**
 * Factory Method para la creación de Salas.
 * Genera automáticamente el `id_sala` con formato 'AAA-00' según el tipo.
 *
 * Ejemplo:
 *   tipo='lab' → busca último LAB-XX → genera LAB-(XX+1)
 *   tipo='aud' → busca último AUD-XX → genera AUD-(XX+1)
 */
export class SalaFactory {
  /**
   * Genera el siguiente id_sala disponible para el tipo dado.
   * Consulta la DB para obtener el último ID y lo incrementa.
   */
  static async generarIdSala(tipo: TipoSala): Promise<string> {
    const prefijo = PREFIJOS_SALA[tipo];
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
      siguienteNumero = ultimoNumero + 1;
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
