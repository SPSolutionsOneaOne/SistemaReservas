/* Caso CP-FA2-026 — Rechazar reserva para bloque ya iniciado.
   Verifica que el servidor rechace la creación de una reserva para
   un bloque que ya empezó hoy. Ejecuta contra localhost:3000. */
const { insertarUsuario, eliminarUsuario, login, sesionHeaders } = require('./90/ctx.cjs');
const BASE = 'http://localhost:3000';

(async () => {
  const u = await insertarUsuario('alumno');
  try {
    const l = await login(u.rut, u.password);
    if (l.status !== 200) {
      console.log('FAIL: login status ' + l.status);
      process.exitCode = 1;
      return;
    }

    // Bloque 0 hoy = 08:30-09:15, ya iniciado
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
    const resp = await fetch(`${BASE}/api/reservas`, {
      method: 'POST',
      headers: sesionHeaders(l.cookie),
      body: JSON.stringify({
        id_sala: 'BIB-01',
        usuario_rut: u.rut,
        fecha: hoy,
        bloque_horario: 0,
        cantidad_asistentes: 1,
        proposito: 'Prueba bloque iniciado',
        asistentes: [],
      }),
    });

    const body = await resp.json().catch(() => ({}));
    const ok = resp.status === 422;
    console.log(`Caso CP-FA2-026: ${ok ? 'PASS' : 'FAIL'}`);
    console.log(`HTTP ${resp.status}`);
    console.log(JSON.stringify(body, null, 2));

    process.exitCode = ok ? 0 : 1;
  } finally {
    await eliminarUsuario(u.rut).catch(() => {});
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 2;
});
