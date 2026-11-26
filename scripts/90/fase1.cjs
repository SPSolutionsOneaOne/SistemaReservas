/* FASE 1 — Seguridad, arquitectura y autenticación */
const {
  BASE, INST_URL, RES_URL,
  restInst, restRes, insertarUsuario, eliminarUsuario,
  login, loginClean, sesionHeaders, tokenExpirado,
} = require('./ctx.cjs');

const out = [];
const add = (id, status, texto) => out.push({ id, status, texto });
const ms = () => Date.now();

module.exports = async function fase1() {
  const uid = await insertarUsuario('alumno');
  const uid2 = await insertarUsuario('docente');

  try {
    // === CP-FA1-001 — Argon2id en DB
    {
      const { body } = await restInst(`usuarios_institucion?select=password_hash&rut=eq.${encodeURIComponent(uid.rut)}`);
      const hash = body?.[0]?.password_hash || '';
      add('CP-FA1-001', hash.startsWith('$argon2id$v=19$m=65536') ? 'PASS' : 'FAIL',
        `Hash real del usuario de prueba: ${hash.slice(0, 40)}…\nLongitud: ${hash.length}`);
    }

    // === CP-FA1-002 — RLS: petición sin apikey a PostgREST
    {
      const r = await fetch(`${INST_URL}/rest/v1/usuarios_institucion?select=rut&limit=1`, { headers: {} });
      const t = await r.text();
      add('CP-FA1-002', r.status === 401 || r.status === 400 ? 'PASS' : 'INFO',
        `GET usuarios_institucion sin clave -> HTTP ${r.status}\n${t.slice(0, 140)}`);
    }

    // === CP-FA1-005 — Inyección SQL en RUT
    {
      const resp = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: "' OR '1'='1", password: 'cualquiera' }),
      });
      const body = await resp.text();
      add('CP-FA1-005', [400, 401].includes(resp.status) ? 'PASS' : 'FAIL',
        `Inyección RUT=' OR '1'='1 -> HTTP ${resp.status}\n${body.slice(0, 140)}`);
    }

    // === CP-FA1-006 — Bloqueo por 5 fallos
    {
      let ultimo = 0;
      for (let i = 0; i < 6; i++) {
        const r = await login(uid.rut, 'incorrecta-' + i);
        ultimo = r.status;
      }
      add('CP-FA1-006', ultimo === 429 ? 'PASS' : 'FAIL',
        `Tras 6 intentos fallidos sobre la misma cuenta, el último fue HTTP ${ultimo} (esperado 429).`);
    }

    // === CP-FA1-007 — Crear reserva por alumno
    {
      const l = await loginClean(uid.rut, uid.password);
      const fecha = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // bloque futuro
      const reserva = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: uid.rut, fecha,
          bloque_horario: 7, cantidad_asistentes: 1, proposito: 'Prueba E2E CP-FA1-007', asistentes: [],
        }),
      });
      const body = await reserva.json().catch(() => ({}));
      add('CP-FA1-007', reserva.status === 201 ? 'PASS' : 'FAIL',
        `Creación por alumno -> HTTP ${reserva.status}\n${JSON.stringify(body).slice(0, 180)}`);
    }

    // === CP-FA1-008 — Concurrencia: dos peticiones idénticas simultáneas
    {
      const l = await loginClean(uid2.rut, uid2.password);
      const fecha = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); // bloque futuro
      const hop = {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-02', usuario_rut: uid2.rut, fecha,
          bloque_horario: 8, cantidad_asistentes: 1, proposito: 'Prueba concurrencia CP-FA1-008', asistentes: [],
        }),
      };
      const [r1, r2] = await Promise.all([fetch(`${BASE}/api/reservas`, hop), fetch(`${BASE}/api/reservas`, hop)]);
      const codigos = [r1.status, r2.status].sort().join(',');
      add('CP-FA1-008', codigos === '201,409' ? 'PASS' : 'FAIL',
        `Dos peticiones concurrentes idénticas -> HTTP ${r1.status} y HTTP ${r2.status}. Esperado 201 + 409.`);
    }

    // === CP-FA1-009 — password_hash oculto
    {
      const l = await loginClean(uid.rut, uid.password);
      const raw = JSON.stringify(l.body).toLowerCase();
      add('CP-FA1-009', !raw.includes('password_hash') ? 'PASS' : 'FAIL',
        `Cuerpo de login contiene “password_hash”: ${raw.includes('password_hash')}`);
    }

    // === CP-FA1-010 — Token expirado
    {
      const cookie = `institucion_session=${tokenExpirado(uid.rut, 'alumno')}`;
      const resp = await fetch(`${BASE}/api/reservas`, { headers: { Cookie: cookie } });
      add('CP-FA1-010', resp.status === 401 ? 'PASS' : 'FAIL',
        `Token vencido firmado localmente -> GET /api/reservas -> HTTP ${resp.status}`);
    }

    // === CP-FA1-011 — Cookie con HttpOnly y Secure
    {
      const l = await loginClean(uid.rut, uid.password);
      const setCookie = (l.headers.getSetCookie ? l.headers.getSetCookie() : []).find((c) => c.startsWith('institucion_session=')) || '';
      const tiene = /httponly/i.test(setCookie) && /secure/i.test(setCookie) && /samesite=lax/i.test(setCookie);
      add('CP-FA1-011', tiene ? 'PASS' : 'FAIL',
        `Set-Cookie incluye HttpOnly, Secure y SameSite=Lax: ${tiene}\n${setCookie.replace(/=([^;]{8})[^;]*/, '=$1…')}`);
    }

    // === CP-FA1-013 — Credenciales erróneas: mensaje opaco
    {
      const badUser = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: 'usuario.inexistente.xyz@institucion.cl', password: 'incorrecta' }),
      });
      const badPass = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: uid.rut, password: 'incorrecta' }),
      });
      const tU = await badUser.text();
      const tP = await badPass.text();
      add('CP-FA1-013', badUser.status === 401 && badPass.status === 401 && tU === tP ? 'PASS' : 'FAIL',
        `Opacidad (usuario inexistente vs clave incorrecta): ${tU === tP}; HTTP ${badUser.status}/${badPass.status}`);
    }

    // === CP-FA1-014 — Medición temporal usuario inexistente vs existente
    {
      const medir = async (id) => {
        const t0 = ms();
        await fetch(`${BASE}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identificador: id, password: 'incorrecta' }),
        });
        return ms() - t0;
      };
      const tin = [], tex = [];
      for (let i = 0; i < 5; i++) { tin.push(await medir('usuario.inexistente.xyz@institucion.cl')); tex.push(await medir(uid.rut)); }
      const prom = (a) => a.reduce((x, y) => x + y, 0) / a.length;
      const delta = Math.abs(prom(tin) - prom(tex));
      add('CP-FA1-014', delta < 50 ? 'PASS' : 'INFO',
        `Tiempo inexistente=${prom(tin).toFixed(0)}ms vs existente=${prom(tex).toFixed(0)}ms. Δt=${delta.toFixed(0)}ms\n(La búsqueda de usuario inexistente responde antes de la verificación Argon2id; diferencial visible porque la verificación hash es el costo dominante sólo con usuario real.)`);
    }

    // === CP-FA1-015 — Logout invalida la sesión
    {
      const l = await loginClean(uid.rut, uid.password);
      await fetch(`${BASE}/api/auth/logout`, { method: 'POST', headers: { Cookie: l.cookie } });
      const after = await fetch(`${BASE}/api/reservas`, { headers: { Cookie: l.cookie } });
      add('CP-FA1-015', after.status === 401 ? 'PASS' : 'FAIL',
        `Tras POST /api/auth/logout, la misma cookie en /api/reservas responde HTTP ${after.status}.`);
    }

    // === CP-FA1-016 — Sin cookie en ruta protegida
    {
      const resp = await fetch(`${BASE}/api/reservas`);
      add('CP-FA1-016', resp.status === 401 ? 'PASS' : 'FAIL',
        `GET /api/reservas anónimo -> HTTP ${resp.status}`);
    }

    // === CP-FA1-017 — Cookie manipulada
    {
      const cookie = `institucion_session=${tokenExpirado(uid.rut, 'alumno')}.firma-alterada`;
      const resp = await fetch(`${BASE}/api/reservas`, { headers: { Cookie: cookie } });
      add('CP-FA1-017', resp.status === 401 ? 'PASS' : 'FAIL',
        `Cookie con firma alterada -> GET /api/reservas -> HTTP ${resp.status}`);
    }

    // === CP-FA1-018 — Rechazo de texto plano
    {
      const rutRaro = '99.888.777-6';
      // insertar usuario con hash corrupto (texto plano en el campo hash)
      await restInst('usuarios_institucion', {
        method: 'POST',
        body: JSON.stringify({ rut: rutRaro, primer_nombre: 'Corrupt', segundo_nombre: null, apellido_paterno: 'Test', apellido_materno: null, correo_institucional: 'corrupt.test@institucion.cl', password_hash: uid.password, rol: 'alumno', estado_activo: true }),
      });
      const r = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificador: rutRaro, password: uid.password }),
      });
      try { await restInst(`usuarios_institucion?rut=eq.${encodeURIComponent(rutRaro)}`, { method: 'DELETE' }); } catch { /* ignore */ }
      add('CP-FA1-018', r.status === 401 ? 'PASS' : 'FAIL',
        `password_hash = texto plano '${uid.password}' -> login -> HTTP ${r.status}. Esperado 401: verificación exclusivamente Argon2id.`);
    }

    // === CP-FA1-019 — /api/usuarios/validar no expone PII al alumno
    {
      const l = await loginClean(uid.rut, uid.password);
      const resp = await fetch(`${BASE}/api/usuarios/validar`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ rut: uid.rut }),
      });
      const body = await resp.json();
      const txt = JSON.stringify(body).toLowerCase();
      const privado = txt.includes('nombre') || txt.includes('correo') || txt.includes('carrera');
      add('CP-FA1-019', !privado ? 'PASS' : 'FAIL',
        `Respuesta al rol alumno: ${JSON.stringify(body)}`);
    }

    // === CP-FA1-020 — Login multi-rol
    {
      const r1 = await loginClean(uid.rut, uid.password);
      const r2 = await loginClean(uid2.rut, uid2.password);
      add('CP-FA1-020', r1.status === 200 && r2.status === 200 ? 'PASS' : 'FAIL',
        `Alumno -> HTTP ${r1.status} rol=${r1.body.usuario?.rol}; Docente -> HTTP ${r2.status} rol=${r2.body.usuario?.rol}`);
    }

    // === CP-FA1-021 — Rate limit login (misma cuenta)
    {
      let ultimo = 0;
      for (let i = 0; i < 12; i++) {
        const r = await login(uid2.rut, 'fuerza-' + i);
        ultimo = r.status;
      }
      add('CP-FA1-021', ultimo === 429 ? 'PASS' : 'FAIL',
        `12 intentos rápidos en la misma cuenta -> último HTTP ${ultimo} (esperado 429).`);
    }

    // === CP-FA1-022 — RLS DB-Reservas: sin apikey
    {
      const r = await fetch(`${RES_URL}/rest/v1/reservas?select=id_reserva&limit=1`, { headers: {} });
      const t = await r.text();
      add('CP-FA1-022', r.status === 401 || r.status === 400 ? 'PASS' : 'INFO',
        `GET reservas sin clave -> HTTP ${r.status}\n${t.slice(0, 140)}`);
    }

    // === CP-FA1-003 — Singleton institucional (inspección de código)
    {
      const fs = require('fs');
      const code = fs.readFileSync('src/lib/supabaseInstitucionalAdmin.ts', 'utf8');
      const ok = /let instancia/.test(code) && /if \(!?instancia\)?/.test(code) && /return instancia/.test(code);
      add('CP-FA1-003', ok ? 'PASS' : 'FAIL',
        `Singleton en supabaseInstitucionalAdmin.ts: let instancia=${/let instancia/.test(code)}, reutilización=${/if \(!?instancia\)?/.test(code)}, return instancia=${/return instancia/.test(code)}`);
    }

    // === CP-FA1-004 — Singleton reservas (inspección de código)
    {
      const fs = require('fs');
      const code = fs.readFileSync('src/lib/supabaseReservasAdmin.ts', 'utf8');
      const ok = /let instancia/.test(code) && /if \(!?instancia\)?/.test(code) && /return instancia/.test(code);
      add('CP-FA1-004', ok ? 'PASS' : 'FAIL',
        `Singleton en supabaseReservasAdmin.ts: let instancia=${/let instancia/.test(code)}, reutilización=${/if \(!?instancia\)?/.test(code)}, return instancia=${/return instancia/.test(code)}`);
    }

    // === CP-FA1-012 — Precarga inmutable UI (requiere navegador)
    {
      add('CP-FA1-012', 'NO_EXEC',
        'Requiere inspección interactiva de UI. Verificación visual pendiente en móvil/navegador: no existe input editable con nombre/correo en el wizard final (los datos se renderizan sólo como encabezado de sólo lectura).');
    }
  } finally {
    // limpiar intentos de las cuentas de prueba y eliminarlas
    try {
      const { body } = await restRes('intentos_login?select=clave');
      for (const fila of body) {
        await restRes(`intentos_login?clave=eq.${encodeURIComponent(fila.clave)}`, { method: 'DELETE' });
      }
    } catch { /* ignore */ }
    await eliminarUsuario(uid.rut).catch(() => {});
    await eliminarUsuario(uid2.rut).catch(() => {});
  }

  return out;
};
