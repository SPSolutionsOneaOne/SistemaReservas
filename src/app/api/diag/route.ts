import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Endpoint temporal de diagnóstico. Se elimina después de verificar producción.
const CLAVE = 'diag-20261106-7f3c9a';

function hostDe(valor: string | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).host;
  } catch {
    return 'URL_INVALIDA';
  }
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('k') !== CLAVE) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const resultado: Record<string, unknown> = {
    runtime: {
      node: process.version,
      vercel: process.env.VERCEL ?? null,
      region: process.env.VERCEL_REGION ?? null,
      entorno: process.env.NODE_ENV,
    },
    variables: {
      SESSION_SECRET_presente: Boolean(process.env.SESSION_SECRET),
      SESSION_SECRET_longitud: process.env.SESSION_SECRET?.length ?? 0,
      INSTITUCIONAL_URL_presente: Boolean(process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL),
      INSTITUCIONAL_URL_host: hostDe(process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL),
      INSTITUCIONAL_KEY_presente: Boolean(process.env.SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY),
      INSTITUCIONAL_KEY_longitud: process.env.SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY?.length ?? 0,
      RESERVAS_URL_presente: Boolean(process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL),
      RESERVAS_URL_host: hostDe(process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL),
      RESERVAS_KEY_presente: Boolean(process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY),
      RESERVAS_KEY_longitud: process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY?.length ?? 0,
    },
    argon2: null,
    supabaseReservas: null,
    supabaseInstitucional: null,
  };

  try {
    const mod = (await import('argon2')) as unknown as {
      default?: { hash?: unknown; verify?: unknown };
    };
    resultado.argon2 = {
      ok: true,
      tieneHash: typeof mod.default?.hash === 'function',
      tieneVerify: typeof mod.default?.verify === 'function',
    };
  } catch (err) {
    resultado.argon2 = { ok: false, error: String((err as Error)?.message ?? err) };
  }

  const resUrl = process.env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL?.trim();
  const resKey = process.env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY?.trim();
  if (resUrl && resKey) {
    try {
      const supabase = createClient(resUrl, resKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error, count } = await supabase
        .from('salas')
        .select('id_sala', { count: 'exact', head: true });
      resultado.supabaseReservas = error
        ? { ok: false, code: error.code, message: error.message }
        : { ok: true, salas: count ?? null };
    } catch (err) {
      resultado.supabaseReservas = {
        ok: false,
        error: String((err as Error)?.message ?? err),
      };
    }
  } else {
    resultado.supabaseReservas = { ok: false, error: 'variables_faltantes' };
  }

  const insUrl = process.env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL?.trim();
  const insKey = process.env.SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY?.trim();
  if (insUrl && insKey) {
    try {
      const supabase = createClient(insUrl, insKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error, count } = await supabase
        .from('usuarios_institucion')
        .select('id', { count: 'exact', head: true });
      resultado.supabaseInstitucional = error
        ? { ok: false, code: error.code, message: error.message }
        : { ok: true, usuarios: count ?? null };
    } catch (err) {
      resultado.supabaseInstitucional = {
        ok: false,
        error: String((err as Error)?.message ?? err),
      };
    }
  } else {
    resultado.supabaseInstitucional = { ok: false, error: 'variables_faltantes' };
  }

  return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
}
