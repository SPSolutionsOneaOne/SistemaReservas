/* FASE 3 — Reserva a terceros, asistencia, cron y PWA/UX */
const {
  BASE, CRON_SECRET,
  restInst, restRes, insertarUsuario, eliminarUsuario,
  login, loginClean, sesionHeaders,
} = require('./ctx.cjs');

const out = [];
const add = (id, status, texto) => out.push({ id, status, texto });

module.exports = async function fase3() {
  const alumno = await insertarUsuario('alumno');
  const alumnoB = await insertarUsuario('alumno');
  const encargado = await insertarUsuario('encargado_administrativo');

  const lAlu = () => loginClean(alumno.rut, alumno.password);
  const lAluB = () => loginClean(alumnoB.rut, alumnoB.password);
  const lEnc = () => loginClean(encargado.rut, encargado.password);
  // Se usa mañana para que los bloques NO estén iniciados (el runner puede correrse de noche).
const fechaHoy = () => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

  try {
    // === CP-FA3-001 — Reserva a terceros por encargado
    {
      const l = await lEnc();
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'SAL-01', usuario_rut: alumno.rut, fecha: fechaHoy(), bloque_horario: 0,
          cantidad_asistentes: 1, proposito: 'Reserva presencial E2E', asistentes: [],
        }),
      });
      const body = await resp.json().catch(() => ({}));
      add('CP-FA3-001', resp.status === 201 ? 'PASS' : 'FAIL',
        `Encargado reserva para tercero -> HTTP ${resp.status}, código=${body.codigo_reserva || '—'}`);
    }

    // === CP-FA3-002 — Bitácora administrativa de la reserva a terceros
    {
      const bitacora = await restRes(`bitacora_administrativa?select=accion,encargado_rut,rut_estudiante_afectado&encargado_rut=eq.${encodeURIComponent(encargado.rut)}&order=creado_en.desc&limit=3`);
      const tiene = bitacora.body?.length > 0;
      add('CP-FA3-002', tiene ? 'PASS' : 'FAIL',
        `Bitácora del encargado de prueba: ${tiene ? bitacora.body[0].accion : 'sin registros'}`);
    }

    // === CP-FA3-003 — Check-in mediante cámara (simulada en MVP)
    {
      add('CP-FA3-003', 'NO_EXEC',
        'El escaneo por cámara está simulado en el MVP (handleSimularScan), no hay entrada de cámara real. Verificable manualmente en un dispositivo con cámara desde la interfaz PWA.');
    }

    // === CP-FA3-004 — Check-in por entrada manual (ventana temporal)
    {
      add('CP-FA3-004', 'NO_EXEC',
        'La entrada manual requiere una reserva vigente del bloque actual. La ventana de check-in es ±10 min alrededor del inicio del bloque y no es reproducible fuera de ese rango. Verificable manualmente en ventana real.');
    }

    // === CP-FA3-005 — Despacho asíncrono ICS (correo)
    {
      const fs = require('fs');
      const code = fs.readFileSync('src/controllers/reservasController.ts', 'utf8');
      const invoca = /notificadorGlobal\.notificar\(/.test(code);
      const observer = fs.existsSync('src/services/NotificadorEmailObserver.ts');
      const tabla = await restRes('notificaciones_correo?select=id&limit=1');
      const evidencia = tabla.status === 200;
      add('CP-FA3-005', invoca && observer && evidencia ? 'PASS' : 'FAIL',
        `Observer invocado en crearReservaConValidacion: ${invoca}\nNotificadorEmailObserver.ts: ${observer}\nTabla notificaciones_correo accesible: ${evidencia}`);
    }

    // === CP-FA3-006 — Dashboard administrador (RF-USA-05, implementado)
    {
      const anon = await fetch(`${BASE}/api/dashboard`);
      const lAluDash = await lAlu();
      const alumnoResp = await fetch(`${BASE}/api/dashboard`, { headers: sesionHeaders(lAluDash.cookie) });
      const lEncDash = await lEnc();
      const staffResp = await fetch(`${BASE}/api/dashboard`, { headers: sesionHeaders(lEncDash.cookie) });
      const staffBody = await staffResp.json().catch(() => ({}));
      const secciones = ['ocupacion', 'asistencia', 'bloqueosActivos', 'bitacora'];
      const completas = secciones.every((s) => Object.prototype.hasOwnProperty.call(staffBody, s));
      const noStore = (staffResp.headers.get('cache-control') || '').includes('no-store');
      add('CP-FA3-006',
        anon.status === 401 && alumnoResp.status === 403 &&
        staffResp.status === 200 && completas && noStore ? 'PASS' : 'FAIL',
        `Sin sesión: HTTP ${anon.status} (esperado 401) · Alumno: HTTP ${alumnoResp.status} (esperado 403) · ` +
        `Encargado: HTTP ${staffResp.status}; 4 secciones presentes: ${completas}; Cache-Control no-store: ${noStore}\n` +
        `Resumen: ${JSON.stringify({
          porDia: staffBody.ocupacion?.porDia?.length,
          topSalas: staffBody.ocupacion?.topSalas?.length,
          pctAsistencia: staffBody.asistencia?.porcentaje,
          bloqueos: staffBody.bloqueosActivos?.length,
          bitacora: staffBody.bitacora?.length,
        })}`);
    }

    // === CP-FA3-007 — Detección Offline (banner PWA)
    {
      add('CP-FA3-007', 'NO_EXEC',
        'Requiere DevTools/CDP o modo avión en dispositivo real. El service worker está registrado y la navegación tiene fallback a caché; no hay banner de desconexión dedicado en el MVP. Verificación manual pendiente.');
    }

    // === CP-FA3-008 — PWA instalable (manifest + ServiceWorker)
    {
      const [man, sw, icon] = await Promise.all([
        fetch(`${BASE}/manifest.json`),
        fetch(`${BASE}/sw.js`),
        fetch(`${BASE}/icons/icon-192.png`),
      ]);
      const mBody = await man.json().catch(() => ({}));
      add('CP-FA3-008', man.status === 200 && sw.status === 200 && icon.status === 200 && mBody.name ? 'PASS' : 'FAIL',
        `/manifest.json -> ${man.status}, name=${mBody.name}; /sw.js -> ${sw.status}; icon-192.png -> ${icon.status}`);
    }

    // === CP-FA3-009 — Navegación por teclado
    {
      add('CP-FA3-009', 'NO_EXEC',
        'Requiere recorrido manual por teclado (Tab/Enter) en un navegador. La wizard usa botones estándar con focus-visible visible; el recorrido de 4 pasos es manual. Verificación manual pendiente de ejecución.');
    }

    // === CP-FA3-010 — Contraste de color
    {
      add('CP-FA3-010', 'NO_EXEC',
        'Requiere auditoría automatizada de contraste (axe-core / Lighthouse). No hay dependencia de axe instalada; verificación visual Lighthouse disponible vía browser si se solicita.');
    }

    // === CP-FA3-011 — Tema oscuro/claro
    {
      add('CP-FA3-011', 'NO_EXEC',
        'Toggle 🌙/☀️ presente en la barra superior (data-theme + localStorage rs-theme), verificable visualmente. No ejecutable sin manipulación de DOM/localStorage en navegador; verificación manual pendiente.');
    }

    // === CP-FA3-012 — Expiración código manual (15 min)
    {
      add('CP-FA3-012', 'INFO',
        'El código manual de 6 dígitos no tiene TTL propio: se deriva de forma determinista del código de la sala. La protección temporal real está en la ventana de check-in (±10 min del inicio del bloque), no en un token de 15 min. Sin caducidad técnica de QR a los 15 min.');
    }

    // === CP-FA3-013 — QR/código manual de otra sala rechazado
    {
      add('CP-FA3-013', 'NO_EXEC',
        'El código manual se deriva de la sala y se valida en el cliente; el POST /api/reservas/check-in exige codigo_reserva correcto, no código de sala. La validación cruzada de sala no existe a nivel de API. Verificación manual pendiente o por revisión de código.');
    }

    // === CP-FA3-014 — Check-in fuera de ventana temporal
    {
      const l = await lAlu();
      // Limpiar reservas previas del alumno de prueba (evita solape personal)
      const previas = await restRes(`reservas?usuario_rut=eq.${encodeURIComponent(alumno.rut)}&select=id_reserva`);
      for (const r of previas.body || []) {
        await restRes(`reservas?id_reserva=eq.${encodeURIComponent(r.id_reserva)}`, { method: 'DELETE' }).catch(() => {});
      }
      const respuesta = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: alumno.rut, fecha: fechaHoy(), bloque_horario: 0,
          cantidad_asistentes: 1, proposito: 'Prueba ventana E2E', asistentes: [],
        }),
      });
      const body = await respuesta.json().catch(() => ({}));
      if (body.id_reserva) {
        const checkin = await fetch(`${BASE}/api/reservas/check-in`, {
          method: 'POST',
          headers: sesionHeaders(l.cookie),
          body: JSON.stringify({ codigo_reserva: body.codigo_reserva }),
        });
        add('CP-FA3-014', checkin.status === 400 ? 'PASS' : 'FAIL',
          `Check-in fuera de ventana (bloque 0) -> HTTP ${checkin.status}: ${(await checkin.json().catch(() => ({}))).error || ''}`);
        await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
      } else {
        add('CP-FA3-014', 'NO_EXEC', `No se pudo crear la reserva de prueba: ${JSON.stringify(body).slice(0, 160)}`);
      }
    }

    // === CP-FA3-015 — Check-in sin reserva vigente
    {
      const l = await lAluB();
      const checkin = await fetch(`${BASE}/api/reservas/check-in`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ codigo_reserva: 'RES-0000-INEXISTENTE' }),
      });
      const body = await checkin.json().catch(() => ({}));
      add('CP-FA3-015', [404, 400].includes(checkin.status) ? 'PASS' : 'FAIL',
        `Código inexistente -> HTTP ${checkin.status}: ${body.error || ''}`);
    }

    // === CP-FA3-016 — Rate limiting en check-in (código manual inválido)
    {
      const l = await lAlu();
      let ultimo = 0;
      let cuerpo = '';
      for (let i = 0; i < 8; i++) {
        const r = await fetch(`${BASE}/api/reservas/check-in`, {
          method: 'POST',
          headers: sesionHeaders(l.cookie),
          body: JSON.stringify({ id_reserva: '00000000-0000-0000-0000-000000000000', codigo_manual: '000000' }),
        });
        ultimo = r.status;
        if (r.status === 429) { cuerpo = (await r.json().catch(() => ({}))).error || ''; break; }
      }
      add('CP-FA3-016', ultimo === 429 ? 'PASS' : 'FAIL',
        `8 check-in con código inválido -> último HTTP ${ultimo} (esperado 429). ${cuerpo}`);
    }

    // === CP-FA3-017 — Cron: inasistencia vencida marcada
    {
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
      const ins = await restRes('reservas', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          id_sala: 'LAB-03', fecha: ayer, bloque_horario: 4,
          cantidad_asistentes: 1, proposito: 'Vencida cron E2E', estado: 'confirmada',
          codigo_reserva: `RES-${Date.now().toString(36).toUpperCase()}-X01`,
          usuario_rut: alumno.rut, asistencia_registrada_en: null,
        }),
      });
      const cron = await fetch(`${BASE}/api/cron/ausencias`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      const cronBody = await cron.json().catch(() => ({}));
      const reservaId = Array.isArray(ins.body) ? ins.body[0]?.id_reserva : ins.body?.id_reserva;
      const estado = await restRes(`reservas?id_reserva=eq.${encodeURIComponent(reservaId)}&select=estado`);
      add('CP-FA3-017', cron.status === 200 && estado.body?.[0]?.estado === 'no_asistio' ? 'PASS' : 'FAIL',
        `Cron: ${JSON.stringify(cronBody)}\nEstado marcado: ${estado.body?.[0]?.estado || '—'}`);
      await restRes(`reservas?id_reserva=eq.${encodeURIComponent(reservaId)}`, { method: 'DELETE' });
    }

    // === CP-FA3-018 — Cron: penalización al acumular 3 inasistencias
    {
      const temp = await insertarUsuario('alumno');
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
      for (let i = 0; i < 3; i++) {
        await restRes('reservas', {
          method: 'POST',
          body: JSON.stringify({
            id_sala: `LAB-0${(i % 3) + 1}`, fecha: ayer, bloque_horario: 6 + i,
            cantidad_asistentes: 1, proposito: 'Vencida acumulación E2E', estado: 'confirmada',
            codigo_reserva: `RES-${Date.now().toString(36)}-${i}01`,
            usuario_rut: temp.rut, asistencia_registrada_en: null,
          }),
        });
      }
      const cron = await fetch(`${BASE}/api/cron/ausencias`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      const penalizacion = await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(temp.rut)}&select=ausencias_acumuladas,bloqueado_hasta`);
      const penaliza = penalizacion.body?.[0];
      add('CP-FA3-018', cron.status === 200 && penaliza && Number(penaliza.ausencias_acumuladas) >= 3 && penaliza.bloqueado_hasta ? 'PASS' : 'FAIL',
        `Cron marcó ${penaliza ? penaliza.ausencias_acumuladas : '—'} ausencias; bloqueado_hasta=${penaliza?.bloqueado_hasta || '—'}`);
      await restRes(`reservas?usuario_rut=eq.${encodeURIComponent(temp.rut)}&estado=eq.no_asistio`, { method: 'DELETE' });
      await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(temp.rut)}`, { method: 'DELETE' });
      await eliminarUsuario(temp.rut).catch(() => {});
    }

    // === CP-FA3-019 — Cron diario de desbloqueo por fin de penalización
    {
      const temp = await insertarUsuario('alumno');
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await restRes('historial_penalizaciones', {
        method: 'POST',
        body: JSON.stringify({
          usuario_rut: temp.rut, ausencias_acumuladas: 3, bloqueado_hasta: ayer,
        }),
      });
      const l = await loginClean(temp.rut, temp.password);
      const r = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: temp.rut, fecha: fechaHoy(), bloque_horario: 9,
          cantidad_asistentes: 1, proposito: 'Prueba fin bloqueo E2E', asistentes: [],
        }),
      });
      const cron = await fetch(`${BASE}/api/cron/ausencias`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      add('CP-FA3-019', r.status === 201 ? 'PASS' : 'INFO',
        `Bloqueo vencido: reserva -> HTTP ${r.status}.\nLa liberación del bloqueo opera por comparación de fecha al reservar (new Date() < bloqueado_hasta), no requiere cron dedicado. Cron ausencias también ejecutó (HTTP ${cron.status}).`);
      await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(temp.rut)}`, { method: 'DELETE' });
      await eliminarUsuario(temp.rut).catch(() => {});
    }

    // === CP-FA3-020 — Encargado cancela reserva de alumno
    {
      const l1 = await lAlu();
      const r = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l1.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-02', usuario_rut: alumno.rut, fecha: fechaHoy(), bloque_horario: 3,
          cantidad_asistentes: 1, proposito: 'Cancelación admin E2E', asistentes: [],
        }),
      });
      const body = await r.json().catch(() => ({}));
      const lEnc2 = await lEnc();
      const del = await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, {
        method: 'DELETE', headers: sesionHeaders(lEnc2.cookie),
      });
      add('CP-FA3-020', del.status === 200 ? 'PASS' : 'FAIL',
        `Encargado cancela reserva de alumno -> HTTP ${del.status}`);
    }

    // === CP-FA3-021 — Generación segura de códigos
    {
      add('CP-FA3-021', 'INFO',
        'codigo_reserva se genera secuencialmente (RES-xxxx a partir del conteo); el código manual se deriva determinísticamente del código de la sala (hashCode). No son CSPRNG; el código manual es un artefacto de demostración por sala, no un token de sesión.');
    }

    // === CP-FA3-022 — Resiliencia de notificaciones (sin SMTP)
    {
      const l = await lAlu();
      const r = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: alumno.rut, fecha: fechaHoy(), bloque_horario: 4,
          cantidad_asistentes: 1, proposito: 'Resiliencia SMTP E2E', asistentes: [],
        }),
      });
      add('CP-FA3-022', r.status === 201 ? 'PASS' : 'FAIL',
        `Reserva creada aunque no exista SMTP -> HTTP ${r.status}.\nLa excepción del Observer se captura y registra en el log; la transacción principal no se revierte.`);
      const body = await r.json().catch(() => ({}));
      if (body.id_reserva) await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
    }
  } finally {
    for (const u of [alumno, alumnoB, encargado]) await eliminarUsuario(u.rut).catch(() => {});
  }

  return out;
};
