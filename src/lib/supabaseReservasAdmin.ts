import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

/**
 * Cliente privado para operaciones del servidor sobre DB-Reservas.
 * Usa la clave secreta (service role), por lo que OMITE RLS.
 * Nunca debe importarse desde un componente cliente.
 */
export function getSupabaseReservasAdmin(): SupabaseClient {
  if (!instancia) {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY?.trim();

    if (!rawUrl || !serviceRoleKey) {
      throw new Error(
        'Falta configurar NEXT_PUBLIC_SUPABASE_RESERVAS_URL o SUPABASE_RESERVAS_SERVICE_ROLE_KEY en el servidor.'
      );
    }

    const url = rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

    instancia = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return instancia;
}
