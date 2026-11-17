/* Módulo común para el runner de 90 casos. Temporal mientras dure la verificación. */
const fs = require('fs');
const argon2 = require('argon2');
const { createHmac } = require('crypto');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}

const INST_URL = env.NEXT_PUBLIC_SUPABASE_INSTITUCIONAL_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const RES_URL = env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
const INST_KEY = env.SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY;
const RES_KEY = env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY;
const SECRET = env.SESSION_SECRET;
const BASE = 'https://sistema-reservas-lac.vercel.app';

const headers = (key, extra = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function restInst(path, options = {}) {
  const resp = await fetch(`${INST_URL}/rest/v1/${path}`, { ...options, headers: headers(INST_KEY, options.headers) });
  const text = await resp.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!resp.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${resp.status}: ${text}`);
  return { status: resp.status, body };
}

async function restRes(path, options = {}) {
  const resp = await fetch(`${RES_URL}/rest/v1/${path}`, { ...options, headers: headers(RES_KEY, options.headers) });
  const text = await resp.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!resp.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${resp.status}: ${text}`);
  return { status: resp.status, body };
}

function dvDe(cuerpo) {
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const r = 11 - (suma % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

const usados = new Set();
function rutValido() {
  while (true) {
    const cuerpo = String(Math.floor(10_000_000 + Math.random() * 89_000_000));
    const rut = `${cuerpo.slice(0, -3)}.${cuerpo.slice(-3)}-${dvDe(cuerpo)}`;
    if (!usados.has(rut)) {
      usados.add(rut);
      return rut;
    }
  }
}

async function insertarUsuario(rol) {
  const rut = rutValido();
  const email = `prueba.${rut.replace(/[.-]/g, '').toLowerCase()}@institucion.cl`;
  const password = 'Prueba' + Math.floor(1000 + Math.random() * 9000) + '#Min';
  await restInst('usuarios_institucion', {
    method: 'POST',
    body: JSON.stringify({
      rut,
      primer_nombre: 'Usuario',
      segundo_nombre: 'De',
      apellido_paterno: 'Prueba',
      apellido_materno: 'Prueb',
      correo_institucional: email,
      password_hash: await argon2.hash(password),
      rol,
      estado_activo: true,
    }),
  });
  return { rut, email, password };
}

async function eliminarUsuario(rut) {
  const ers = await restRes(`reservas?usuario_rut=eq.${encodeURIComponent(rut)}&select=id_reserva`);
  for (const r of ers.body) {
    // no borra bloqueados de prueba ajenos; sólo suyas
    await restRes(`reservas?id_reserva=eq.${r.id_reserva}`, { method: 'DELETE' });
  }
  await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(rut)}`, { method: 'DELETE' });
  await restInst(`usuarios_institucion?rut=eq.${encodeURIComponent(rut)}`, { method: 'DELETE' });
}

async function login(identificador, password) {
  const resp = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificador, password }),
  });
  const body = await resp.json().catch(() => ({}));
  const setCookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
  const cookie = setCookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('institucion_session='));
  return { status: resp.status, body, cookie, headers: resp.headers };
}

function sesionHeaders(cookie) {
  return { 'Content-Type': 'application/json', Cookie: cookie };
}

/** Firma un token con fecha de expiración en el pasado. */
function tokenExpirado(rut, rol) {
  const ahora = Math.floor(Date.now() / 1000);
  const payload = { rut, rol, iat: ahora - 7200, exp: ahora - 3600 };
  const b64url = (buf) => buf.toString('base64url');
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac('sha256', SECRET).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

const CRON_SECRET = '0a2de5543a60a20cfa70ea7f5f1c981b641019e0ccba10fc';

async function limpiarIntentos() {
  // Borra todas las filas de intentos_login. En pruebas: limpiar el estado de rate limiting.
  const { body } = await restRes('intentos_login?select=clave');
  for (const fila of body) {
    await restRes(`intentos_login?clave=eq.${encodeURIComponent(fila.clave)}`, { method: 'DELETE' });
  }
  return body.length;
}

/** Login con rate limiting reseteado (para tests que no verifican el bloqueo). */
async function loginClean(identificador, password) {
  await limpiarIntentos();
  return login(identificador, password);
}

module.exports = {
  BASE,
  INST_URL, RES_URL, INST_KEY, RES_KEY, SECRET,
  restInst, restRes, insertarUsuario, eliminarUsuario,
  login, sesionHeaders, tokenExpirado, limpiarIntentos, loginClean, CRON_SECRET,
};
