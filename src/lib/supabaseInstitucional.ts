// ============================================================
// CLIENTE SUPABASE — DB-Institucional (Padrón / Autenticación)
// Patrón Singleton: una única instancia por runtime
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let instancia: SupabaseClient | null = null;

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
}

/**
 * Retorna el cliente Singleton de Supabase conectado a DB-Institucional.
 * Uso: consultas a `public.usuarios_institucion` (autenticación, validación de RUT/correo).
 */
export function getSupabaseInstitucional(): SupabaseClient {
  if (!instancia) {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL || 'https://placeholder-institucional.supabase.co';
    const key = (process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_ANON_KEY || 'placeholder-anon-key').trim();
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

export default getSupabaseInstitucional;
