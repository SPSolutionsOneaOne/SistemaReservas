// ============================================================
// CLIENTE SUPABASE — DB-Reservas (Lógica de Negocio y Salas)
// Patrón Singleton: una única instancia por runtime
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

/**
 * Retorna el cliente Singleton de Supabase conectado a DB-Reservas.
 * Uso: consultas a `public.salas`, `public.reservas`,
 *      `public.historial_penalizaciones`, `public.bitacora_administrativa`.
 */
export function getSupabaseReservas(): SupabaseClient {
  if (!instancia) {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL || 'https://placeholder-reservas.supabase.co';
    const key = (process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_ANON_KEY || 'placeholder-anon-key').trim();
    const url = normalizarUrl(rawUrl);

    instancia = createClient(url, key, {
      auth: {
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: true,
      },
    });
  }
  return instancia;
}

export default getSupabaseReservas;
