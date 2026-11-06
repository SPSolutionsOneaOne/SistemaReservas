import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

/** Cliente privado para operaciones del servidor que necesitan consultar usuarios con RLS activado. */
export function getSupabaseInstitucionalAdmin(): SupabaseClient {
  if (!instancia) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY?.trim();

    if (!url || !serviceRoleKey) {
      throw new Error('Falta configurar NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL o SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY en el servidor.');
    }

    instancia = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return instancia;
}
