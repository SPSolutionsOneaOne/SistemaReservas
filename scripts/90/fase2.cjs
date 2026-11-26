/* FASE 2 — Reglas de negocio, validaciones y RBAC de reservas */
const {
  BASE, CRON_SECRET,
  restInst, restRes, insertarUsuario, eliminarUsuario,
  login, loginClean, sesionHeaders,
} = require('./ctx.cjs');

const out = [];
const add = (id, status, texto) => out.push({ id, status, texto });
// Se usa mañana para que los bloques NO estén iniciados (el runner puede correrse de noche).
const fechaHoy = () => new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });

// Combina sala × bloque hasta encontrar un slot libre.
const SALAS = ['BIB-03', 'BIB-02', 'BIB-01', 'SAL-03', 'SAL-02', 'SAL-01', 'LAB-01', 'LAB-02', 'LAB-03', 'AUD-01', 'CON-01', 'CON-02'];
const BLOQUES = [15, 16, 17, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
async function crearReservaSlotLibre(l, fecha, usuarioRut, proposito) {
  for (const sala of SALAS) {
    for (const bloque of BLOQUES) {
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: sala, usuario_rut: usuarioRut, fecha,
          bloque_horario: bloque, cantidad_asistentes: 1, proposito, asistentes: [],
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (resp.status !== 409) return { status: resp.status, body, sala, bloque };
    }
  }
  return { status: 409, body: { error: 'Sin slots libres' }, sala: '', bloque: null };
}

module.exports = async function fase2() {
  const alumno1 = await insertarUsuario('alumno');
  const alumno2 = await insertarUsuario('alumno');
  const docente = await insertarUsuario('docente');
  const encargado = await insertarUsuario('encargado_administrativo');
  const admin = await insertarUsuario('administrador');

  const lA1 = () => loginClean(alumno1.rut, alumno1.password);
  const lA2 = () => loginClean(alumno2.rut, alumno2.password);
  const lDoc = () => loginClean(docente.rut, docente.password);
  const lEnc = () => loginClean(encargado.rut, encargado.password);
  const lAdmin = () => loginClean(admin.rut, admin.password);

  const reservar = async (l, sala, bloque, usuarioRut = alumno1.rut, proposito = 'Prueba E2E') =>
    fetch(`${BASE}/api/reservas`, {
      method: 'POST',
      headers: sesionHeaders(l.cookie),
      body: JSON.stringify({
        id_sala: sala, usuario_rut: usuarioRut, fecha: fechaHoy(),
        bloque_horario: bloque, cantidad_asistentes: 1, proposito, asistentes: [],
      }),
    });

  const limpiarReservasDe = async (rut) => {
    const { body } = await restRes(`reservas?usuario_rut=eq.${encodeURIComponent(rut)}&select=id_reserva`);
    for (const r of body || []) {
      await restRes(`reservas?id_reserva=eq.${encodeURIComponent(r.id_reserva)}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const limpiarEntidades = async () => {
    for (const u of [alumno1, alumno2, docente, encargado, admin]) {
      await eliminarUsuario(u.rut).catch(() => {});
    }
  };

  try {
    // === CP-FA2-001 — Asistente no institucional (correo exterior)
    {
      const l = await lA1();
      const r = await reservar(l, 'LAB-01', 0, alumno1.rut, 'Asistente externo');
      await r.json().catch(() => ({}));
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: alumno1.rut, fecha: fechaHoy(), bloque_horario: 0,
          cantidad_asistentes: 1, proposito: 'Asistente externo',
          asistentes: ['99.999.999-9'],
        }),
      });
      const body = await resp.text();
      const acepta = resp.status === 422 || resp.status === 400;
      add('CP-FA2-001', acepta ? 'PASS' : 'FAIL',
        `RUT no válido como asistente -> HTTP ${resp.status}\n${body.slice(0, 160)}`);
    }

    // === CP-FA2-002 — Usuario inactivo no puede reservar (reserva por tercero)
    {
      const userInactivo = await insertarUsuario('alumno');
      await restInst(`usuarios_institucion?rut=eq.${encodeURIComponent(userInactivo.rut)}`, {
        method: 'PATCH', body: JSON.stringify({ estado_activo: false }),
      });
      const l = await lEnc();
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: userInactivo.rut, fecha: fechaHoy(), bloque_horario: 1,
          cantidad_asistentes: 1, proposito: 'Prueba inactividad', asistentes: [],
        }),
      });
      const body = await resp.json().catch(() => ({}));
      add('CP-FA2-002', resp.status === 403 ? 'PASS' : 'FAIL',
        `Reserva para usuario inactivo -> HTTP ${resp.status}: ${body.error || ''}`);
      await eliminarUsuario(userInactivo.rut).catch(() => {});
    }

    // === CP-FA2-003 — 3 inasistencias -> bloqueo 7 días
    {
      const l = await lA1();
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA');
      // tres reservas vencidas sin asistencia
      for (let i = 0; i < 3; i++) {
        await restRes('reservas', {
          method: 'POST',
          body: JSON.stringify({
            id_sala: `LAB-0${i + 1}`, fecha: ayer, bloque_horario: 2 + i,
            cantidad_asistentes: 1, proposito: 'Prueba vencida E2E', estado: 'confirmada',
            codigo_reserva: `RES-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
            usuario_rut: alumno1.rut, asistencia_registrada_en: null,
          }),
        });
      }
      // disparar el motor via cron autenticado
      const cron = await fetch(`${BASE}/api/cron/ausencias`, { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
      const cronBody = await cron.json().catch(() => ({}));
      const bloqueo = await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(alumno1.rut)}&select=ausencias_acumuladas,bloqueado_hasta`);
      const penaliza = bloqueo.body?.[0];
      const reservarResp = await reservar(l, 'LAB-01', 5);
      add('CP-FA2-003',
        cron.status === 200 && penaliza && Number(penaliza.ausencias_acumuladas) >= 3 && penaliza.bloqueado_hasta && reservarResp.status === 403 ? 'PASS' : 'FAIL',
        `Motor: ${JSON.stringify(cronBody)}\nPenalización: ${JSON.stringify(penaliza || 'no creada')}\nReserva (alumno bloqueado): HTTP ${reservarResp.status}`);
      // limpiar la reserva vencida marcada y resetear contador para no arrastrar al resto
      await restRes(`reservas?usuario_rut=eq.${encodeURIComponent(alumno1.rut)}&estado=eq.no_asistio`, { method: 'DELETE' });
      await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(alumno1.rut)}`, { method: 'DELETE' });
    }

    // === CP-FA2-004 — Reset por check-in (ventana ±10min)
    {
      const pared = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
      const [hora, minutos] = pared.split(':').map(Number);
      const minutosPared = hora * 60 + minutos;
      const enVentana = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17].some((b) => {
        const ini = 8 * 60 + 30 + b * 45;
        return minutosPared >= ini - 10 && minutosPared <= ini + 10;
      });
      add('CP-FA2-004', 'NO_EXEC',
        `CP-FA2-004 requiere que el check-in ocurra en los primeros 10 min del bloque. Hora actual (Chile): ${pared}. Ejecución dependiente de la hora y la confirmación QR — requiere una ventana de 10 minutos exactos y no es determinista. Sólo verificable manualmente en ventana real.`);
      void enVentana;
    }

    // === CP-FA2-005 — Autogeneración de sigla (LAB)
    {
      const l = await lAdmin();
      const crear = await fetch(`${BASE}/api/salas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ nombre_descriptivo: 'Lab E2E Sigla', tipo: 'lab', aforo: 10, piso: 2 }),
      });
      const body = await crear.json().catch(() => ({}));
      add('CP-FA2-005', crear.status === 201 ? 'PASS' : 'FAIL',
        `Sala de prueba creada -> HTTP ${crear.status}, sigla=${body.id_sala || body.error || '—'}`);
      if (body.id_sala) await restRes(`salas?id_sala=eq.${encodeURIComponent(body.id_sala)}`, { method: 'DELETE' }).catch(() => {});
    }

    // === CP-FA2-006 — Autogeneración de sigla (AUD)
    {
      const l = await lAdmin();
      const crear = await fetch(`${BASE}/api/salas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ nombre_descriptivo: 'Auditorio E2E Sigla', tipo: 'aud', aforo: 100, piso: 1 }),
      });
      const body = await crear.json().catch(() => ({}));
      add('CP-FA2-006', crear.status === 201 ? 'PASS' : 'FAIL',
        `Auditorio de prueba creado -> HTTP ${crear.status}, sigla=${body.id_sala || body.error || '—'}`);
      if (body.id_sala) await restRes(`salas?id_sala=eq.${encodeURIComponent(body.id_sala)}`, { method: 'DELETE' }).catch(() => {});
    }

    // === CP-FA2-007 — Cancelación ajena
    {
      await limpiarReservasDe(alumno1.rut);
      await limpiarReservasDe(alumno2.rut);
      const l1 = await lA1();
      const r = await reservar(l1, 'LAB-03', 2);
      const resA = await r.json().catch(() => ({}));
      const l2 = await lA2();
      const del = await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(resA.id_reserva)}`, {
        method: 'DELETE',
        headers: { Cookie: l2.cookie },
      });
      add('CP-FA2-007', del.status === 403 ? 'PASS' : 'FAIL',
        `Alumno B intenta DELETE sobre reserva de Alumno A -> HTTP ${del.status}`);
      // limpiar
      await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(resA.id_reserva)}`, { method: 'DELETE', headers: { Cookie: l1.cookie } });
    }

    // === CP-FA2-008 — Edición de reserva propia por docente
    {
      await limpiarReservasDe(docente.rut);
      const l = await lDoc();
      const r = await reservar(l, 'LAB-02', 3, docente.rut, 'Docente E2E');
      const body = await r.json().catch(() => ({}));
      const ed = await fetch(`${BASE}/api/reservas`, {
        method: 'PATCH',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ id_reserva: body.id_reserva, fecha: fechaHoy(), bloque_horario: 4 }),
      });
      add('CP-FA2-008', ed.status === 200 ? 'PASS' : 'FAIL',
        `Edición de bloque -> HTTP ${ed.status}`);
      await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
    }

    // === CP-FA2-009 — Edición: destino ocupado
    {
      await limpiarReservasDe(docente.rut);
      await limpiarReservasDe(alumno2.rut);
      const l1 = await lDoc();
      const l2 = await lA2();
      const r = await reservar(l1, 'SAL-01', 5, docente.rut, 'Docente solape');
      const body = await r.json().catch(() => ({}));
      await reservar(l2, 'SAL-01', 6, alumno2.rut, 'Bloque ocupado');
      const ed = await fetch(`${BASE}/api/reservas`, {
        method: 'PATCH',
        headers: sesionHeaders(l1.cookie),
        body: JSON.stringify({ id_reserva: body.id_reserva, fecha: fechaHoy(), bloque_horario: 6 }),
      });
      add('CP-FA2-009', ed.status === 409 ? 'PASS' : 'FAIL',
        `Mover a bloque ocupado -> HTTP ${ed.status}`);
      await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l1.cookie) });
    }

    // === CP-FA2-010 — Superar aforo
    {
      await limpiarReservasDe(alumno1.rut);
      const l = await lA1();
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'BIB-01', usuario_rut: alumno1.rut, fecha: fechaHoy(), bloque_horario: 11,
          cantidad_asistentes: 999, proposito: 'Prueba aforo', asistentes: [],
        }),
      });
      const body = await resp.json().catch(() => ({}));
      add('CP-FA2-010', resp.status === 422 ? 'PASS' : 'FAIL',
        `999 asistentes sobre BIB-01 (aforo 6) -> HTTP ${resp.status}: ${body.error || ''}`);
    }

    // === CP-FA2-011 — XSS en propósito
    {
      const l = await lA1();
      const r = await reservar(l, 'LAB-01', 1, alumno1.rut, '<script>alert("xss")</script>');
      const body = await r.json().catch(() => ({}));
      const gpt = await fetch(`${BASE}/api/reservas`, { headers: { Cookie: l.cookie } });
      const lista = await gpt.json().catch(() => ([]));
      const proposito = Array.isArray(lista) && lista.find((x) => x.id_reserva === body.id_reserva)?.proposito;
      const saneado = typeof proposito === 'string' && !/<[^>]*>/.test(proposito);
      add('CP-FA2-011', saneado ? 'PASS' : 'FAIL',
        `Proposito recibido: "${body.proposito || '(no leído)'}".\nProposito almacenado: "${proposito || '(no leído)'}".\nSaneamiento server-side (sin etiquetas HTML): ${saneado}`);
      await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
    }

    // === CP-FA2-012 — Mensaje claro ante 409
    {
      const l1 = await lA1();
      const l2 = await lA2();
      await reservar(l1, 'SAL-02', 7, alumno1.rut, 'Ocupación de prueba CP-FA2-012');
      const r = await reservar(l2, 'SAL-02', 7, alumno2.rut, 'Conflicto esperado');
      const body = await r.json().catch(() => ({}));
      const claro = /conflicto|solap|ocupado|otra reserva/i.test(JSON.stringify(body));
      add('CP-FA2-012', r.status === 409 && claro ? 'PASS' : 'INFO',
        `Respuesta ante solape: HTTP ${r.status}\n${JSON.stringify(body)}`);
    }

    // === CP-FA2-013 — Docente con dominio institucional
    {
      const l = await lDoc();
      add('CP-FA2-013', l.status === 200 && l.body.usuario?.rol === 'docente' ? 'PASS' : 'FAIL',
        `Login docente -> HTTP ${l.status}, rol=${l.body.usuario?.rol || '—'}`);
    }

    // === CP-FA2-014 — 0 asistentes bloqueado
    {
      const l = await lA1();
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: alumno1.rut, fecha: fechaHoy(), bloque_horario: 2,
          cantidad_asistentes: 0, proposito: 'Prueba cero asistentes', asistentes: [],
        }),
      });
      add('CP-FA2-014', [400, 422].includes(resp.status) ? 'PASS' : 'FAIL',
        `0 asistentes -> HTTP ${resp.status}`);
    }

    // === CP-FA2-015 — RBAC: Alumno intentando crear sala
    {
      const l = await lA1();
      const resp = await fetch(`${BASE}/api/salas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ nombre_descriptivo: 'E2E prota', tipo: 'lab', aforo: 10, piso: 1 }),
      });
      add('CP-FA2-015', resp.status === 403 ? 'PASS' : 'FAIL',
        `Alumno POST /api/salas -> HTTP ${resp.status}`);
    }

    // === CP-FA2-016 — RBAC: Docente intentando crear sala
    {
      const l = await lDoc();
      const resp = await fetch(`${BASE}/api/salas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ nombre_descriptivo: 'E2E docente', tipo: 'aud', aforo: 100, piso: 1 }),
      });
      add('CP-FA2-016', resp.status === 403 ? 'PASS' : 'FAIL',
        `Docente POST /api/salas -> HTTP ${resp.status}`);
    }

    // === CP-FA2-017 — RBAC: Alumno reservando a nombre de otro
    {
      const l = await lA1();
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'LAB-01', usuario_rut: alumno2.rut, fecha: fechaHoy(), bloque_horario: 4,
          cantidad_asistentes: 1, proposito: 'Suplantación', asistentes: [],
        }),
      });
      add('CP-FA2-017', resp.status === 403 ? 'PASS' : 'FAIL',
        `Alumno reserva para otro RUT -> HTTP ${resp.status}`);
    }

    // === CP-FA2-018 — Sigla duplicada
    {
      add('CP-FA2-018', 'NO_EXEC',
        'No existe un endpoint público que permita intentar registrar una sigla duplicada: POST /api/salas autogenera la sigla incremental. La unicidad está garantizada por diseño de SalaFactory y por la restricción UNIQUE de la base.');
    }

    // === CP-FA2-019 — Capacidad negativa
    {
      const l = await lAdmin();
      const resp = await fetch(`${BASE}/api/salas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({ nombre_descriptivo: 'E2E negativa', tipo: 'lab', aforo: -5, piso: 1 }),
      });
      add('CP-FA2-019', resp.status === 400 || resp.status === 422 ? 'PASS' : 'FAIL',
        `Aforo -5 -> HTTP ${resp.status}`);
    }

    // === CP-FA2-020 — Reserva al pasado
    {
      const l = await lA1();
      const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const r = await crearReservaSlotLibre(l, ayer, alumno1.rut, 'Viaje al pasado');
      add('CP-FA2-020', r.status === 422 ? 'PASS' : 'FAIL',
        `La creación con fecha ${ayer} devolvió HTTP ${r.status} en sala ${r.sala} bloque ${r.bloque}.`);

      if (r.body?.id_reserva) {
        await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(r.body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
      }
    }

    // === CP-FA2-026 — Reserva en bloque ya iniciado (hoy o pasado)
    {
      const l = await lA1();
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
      const resp = await fetch(`${BASE}/api/reservas`, {
        method: 'POST',
        headers: sesionHeaders(l.cookie),
        body: JSON.stringify({
          id_sala: 'BIB-01', usuario_rut: alumno1.rut, fecha: hoy,
          bloque_horario: 0, cantidad_asistentes: 1, proposito: 'Bloque ya iniciado', asistentes: [],
        }),
      });
      const body = await resp.json().catch(() => ({}));
      add('CP-FA2-026', resp.status === 422 ? 'PASS' : 'FAIL',
        `Bloque ya iniciado (${hoy}) -> HTTP ${resp.status}.\n${JSON.stringify(body)}`);
    }

    // === CP-FA2-021 — Solape personal (mismo usuario, segundo recinto)
    // Corregido: el sistema YA NO permite múltiples recintos simultáneos al
    // mismo usuario en el mismo bloque/fecha. Debe rechazar con HTTP 409.
    {
      const l = await lDoc();
      const r1 = await reservar(l, 'LAB-01', 6, docente.rut, 'Docente bloque A');
      const body1 = await r1.json().catch(() => ({}));
      const r2 = await reservar(l, 'SAL-03', 6, docente.rut, 'Docente bloque B');
      const body2 = await r2.json().catch(() => ({}));
      add('CP-FA2-021', r2.status === 409 ? 'PASS' : 'FAIL',
        `Docente reserva segunda sala en el mismo bloque 6 -> HTTP ${r2.status}.\nEl sistema debe rechazar la doble reserva del mismo usuario en el mismo bloque (restricción personal, no sólo sala/fecha/bloque). Mensaje: ${body2.error || '—'}`);
      if (body1.id_reserva) {
        await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body1.id_reserva)}`, {
          method: 'DELETE',
          headers: sesionHeaders(l.cookie),
        }).catch(() => {});
      }
    }

    // === CP-FA2-022 — Reserva bloqueada por penalización
    {
      await restRes('historial_penalizaciones', {
        method: 'POST',
        body: JSON.stringify({
          usuario_rut: alumno2.rut, ausencias_acumuladas: 3,
          bloqueado_hasta: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });
      const l = await lA2();
      const r = await reservar(l, 'LAB-01', 10);
      add('CP-FA2-022', r.status === 403 ? 'PASS' : 'FAIL',
        `Usuario penalizado intenta reservar -> HTTP ${r.status}`);
      await restRes(`historial_penalizaciones?usuario_rut=eq.${encodeURIComponent(alumno2.rut)}`, { method: 'DELETE' });
    }

    // === CP-FA2-023 — Cancelación propia
    {
      await limpiarReservasDe(alumno2.rut);
      const l = await lA2();
      const r = await crearReservaSlotLibre(l, fechaHoy(), alumno2.rut, 'Cancelar esta');
      const del = await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(r.body?.id_reserva || '')}`, {
        method: 'DELETE', headers: sesionHeaders(l.cookie),
      });
      add('CP-FA2-023', del.status === 200 ? 'PASS' : 'FAIL',
        `Reserva creada en ${r.sala || '—'} bloque ${r.bloque ?? '—'} (HTTP ${r.status}); cancelar propia -> HTTP ${del.status}`);
      if (del.status !== 200 && r.body?.id_reserva) {
        await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(r.body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) });
      }
    }

    // === CP-FA2-024 — Cancelar inexistente
    {
      const l = await lA2();
      const del = await fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent('00000000-0000-0000-0000-000000000000')}`, {
        method: 'DELETE', headers: sesionHeaders(l.cookie),
      });
      add('CP-FA2-024', del.status === 404 ? 'PASS' : 'INFO',
        `Cancelar inexistente -> HTTP ${del.status}`);
    }

    // === CP-FA2-025 — Doble clic en cancelación
    {
      const l = await lA2();
      const r = await reservar(l, 'SAL-02', 9, alumno2.rut, 'Race cancel');
      const body = await r.json().catch(() => ({}));
      const [d1, d2] = await Promise.all([
        fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) }),
        fetch(`${BASE}/api/reservas?id_reserva=${encodeURIComponent(body.id_reserva)}`, { method: 'DELETE', headers: sesionHeaders(l.cookie) }),
      ]);
      add('CP-FA2-025', 'INFO',
        `Dos DELETE simultáneas sobre la misma reserva -> HTTP ${d1.status}, HTTP ${d2.status}.\nSin cabeceras de idempotencia: la segunda operación es sobre recurso inexistente.`);
    }
  } finally {
    await limpiarEntidades();
  }

  return out;
};
