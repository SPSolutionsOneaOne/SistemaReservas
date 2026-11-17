# Casos de Prueba Manuales — Sistema de Reservas

> Basado en el plan de 90 casos de ISO/IEC/IEEE 29119-3. Estas son las pruebas
> que **no pueden ser ejecutadas por scripts automatizados** (requieren entorno
> real, cámara, DevTools o auditorías de accesibilidad) o que el plan marca
> como **pendiente de implementación** o **fallando**.
>
> **Regla de cierre:** cada caso se marca `PASS`, `FAIL` o `BLOQUEADO` con
> evidencia (captura + URL/herramienta) antes de entregarse.

---

## Cómo usar este documento

1. Crear o usar una cuenta de alumno, una docente y un encargado de prueba en
   `DB-Institucional` (Supabase proyecto institucional).
2. Iniciar sesión en la PWA (`https://<tu-app>/` o localhost) con cada perfil.
3. Ejecutar los pasos listados.
4. Adjuntar evidencia en `/evidencias/manual/<CP-XXX>.png`.
5. Rellenar las columnas **Resultado obtenido** y **Estado** en la plantilla
   (columna `Resultado` al final).

---

## Bloque 1 — Usabilidad y accesibilidad (ejecución 100% manual)

### CP-FA1-012 — Precarga inmutable de datos de sesión (ReadOnly)
- **Verificación en**: `/api/auth/login` → `/api/reservas` (Wizard paso Asistentes)
- **Pasos:**
  1. Iniciar sesión con la cuenta de alumno de prueba.
  2. Ir a `Reservar → Crear sala → Asistentes` (o Vista `Mis reservas → Nueva reserva`).
  3. Inspeccionar el encabezado con nombre/correo: debe mostrarse como texto,
     **no** como `<input>` editable.
- **Resultado esperado:** Nombre y correo visibles en modo lectura; cualquier
  intento de edición vía DevTools falla porque no hay input.
- **Estado:** `⏸`

### CP-FA2-004 — Reset contador de ausencias por check-in exitoso
- **Verificación:** window real de check-in (±10 min de inicio del bloque).
- **Pasos:**
  1. Crear y reservar un bloque en el próximo bloque de 45 min para ti mismo
     como titular (alumno de prueba).
  2. Esperar la ventana de check-in (desde 10 min antes hasta 10 min después del inicio).
  3. Desde `Mis reservas`, pulsar `Confirmar asistencia` → escanear QR o ingresar
     código manual de 6 dígitos.
  4. Consultar `select * from historial_penalizaciones where usuario_rut = '<tu rut>'`.
- **Resultado esperado:** `ausencias_acumuladas = 0` y `bloqueado_hasta NULL`.
- **Estado:** `⏸` (ventana exacta de 10 min requerida)

### CP-FA3-003 — Check-in de asistencia escaneando cámara
- **Requiere:** smartphone/cámara funcional; PWA abierta en modo móvil.
- **Pasos:**
  1. Reservar una sala bloque futuro para ti mismo.
  2. Durante la ventana de check-in, navegar a `Mis reservas → Confirmar asistencia`.
  3. Seleccionar modo escanear QR y apuntar al QR impreso.
- **Resultado esperado:** Modo cambia a `Asistencia confirmada` y `asistencia_registrada_en` no es nulo en BD.
- **Estado:** `⏸` (depende de dispositivo con cámara)

### CP-FA3-004 — Check-in contingencia vía código manual de 6 dígitos
- **Pasos:**
  1. Crear reserva futura propia.
  2. Durante ventana de check-in, en `Mis reservas → Confirmar asistencia`, elegir
     `No puedo usar la cámara` y digitar el código de 6 dígitos impreso en la tarjeta.
- **Resultado esperado:** Asistencia marcada como completada; el código acepta solo 6 dígitos y rechaza otros.
- **Estado:** `⏸` (ventana exacta de 10 min requerida)

### CP-FA3-013 — Rechazo de check-in con QR de otra sala
- **Pasos:**
  1. Crear reserva sala `LAB-01` en el próximo bloque.
  2. Durante ventana de check-in, escanear/manual QR de otra sala (ej. `AUD-01`).
- **Resultado esperado:** HTTP 400/409; mensaje "Fuera de horario" o código inválido;
  el servidor exige `codigo_reserva`, no el token del QR.
- **Estado:** `⏸`

### CP-FA3-009 — Navegación completa por teclado (WCAG 2.1)
- **Pasos:**
  1. Abrir la app en desktop/navegador.
  2. Usando solo TAB y ENTER, recorrer login → wizard → Mis reservas → Gestión (si tienes admin).
- **Resultado esperado:** Foco visible en cada control; sin trampas de foco; orden lógico.
- **Estado:** `⏸`

### CP-FA3-010 — Contraste de color en botones y alertas
- **Recursos:** Inspector/Chrome DevTools → Contrast ratio >= 4.5:1 para texto y botones.
- **Pasos:** revisar contraste de todos los botones y alertas (éxito/error/warning) en tema claro y oscuro.
- **Estado:** `⏸`

### CP-FA3-011 — Tema oscuro/claro y responsive
- Paso 1: alternar botón ☀️/🌙 en la barra superior.
- Paso 2: cambiar tamaño de viewport a 360px, 768px, 1440px.
- Verificar que funciona el cambio y no hay scroll horizontal.
- **Estado:** `⏸`

### CP-FA4-003 — Scroll horizontal nulo en viewport 360px
- **Pasos:**
  1. Chrome DevTools → Toggle Device Toolbar → 360×640.
  2. Navegar por wizard completo.
  3. Verificar que no hay scroll horizontal.
- **Estado:** `⏸`

### CP-FA4-002 — Puntaje Lighthouse >= 90 (PWA)
- **Pasos:**
  1. En terminal: `npx lighthouse https://<tu-app> --preset=pwa --output=html --output-path=report.html`
  2. Abrir `report.html` y revisar puntajes de Rendimiento, Accesibilidad, Buenas prácticas, PWA.
- **Estado:** `⏸`

### CP-FA4-005 — Cifrado en reposo AES-256 en Supabase DB
- **Pasos:**
  1. Entrar a Supabase dashboard → Project Settings → Security.
  2. Verificar que la base de datos gestiona cifrado en reposo (certificado SOC 2).
  3. No es auditable desde la app.
- **Estado:** `⏸` (requiere cita con proveedor/SOC2)

### CP-FA4-008 — Uptime mensual >= 99.9%
- **Pasos:**
  1. Vercel dashboard → Project → Analytics → Reliability.
  2. Revisar métricas de disponibilidad del mes.
- **Estado:** `⏸` (requiere Vercel Analytics con token)

### CP-FA4-021 — Verificación y recuperación de backups Supabase
- **Pasos:**
  1. Entrar a Supabase dashboard → Project → Database → Backups.
  2. Descargar dump.
  3. Restaurar en proyecto aislado (o instancia local).
  4. Verificar que datos son consistentes.
- **Estado:** `⏸` (requiere entorno aislado para restaurar)

---

## Bloque 2 — Fallos a corregir antes de aprobar

### CP-FA1-015 — Logout no invalida sesión local
- **Problema real ejecutivo:** la cookie `Max-Age=0` se borra en cliente pero el servidor
  no marca token como inválido. Si se reutiliza la cookie, el `/api/reservas` responde 200.
- **Mitigación (pendiente):** usar base de marcas `sesiones_revocadas` o token version
  e invalidez por nueva sesión.
- **Resultado esperado hoy:** `/api/reservas` sigue respondiendo 200 con cookie loggeada.
  Mejorar el texto en el plan: no marcar aprobado sin fix.
- **Estado:** `❌`

### CP-FA2-020 — Rechazo de reserva en el pasado
- **Problema real ejecutivo:** el sistema solo valida `validarFechaMesEnCurso`, que acepta
  fechas pasadas del mes en curso — no prohíbe el pasado.
- **Bug:** acepta `fecha` de ayer/esta madrugada.
- **Mitigación (pendiente):** comparar `fecha` con `hoy` (Santiago wall clock) y rechazar
  fechas pasadas o días ya iniciados.
- **Estado:** `❌`

### CP-FA3-016 — Rate limiting estricto en código manual
- **Problema real ejecutivo:** `/api/reservas/check-in` no tiene rate limiting. Sólo login
  lo tiene (5 intentos/15 min).
- **Mitigación (pendiente):** aplicar `rateLimit` al endpoint check-in, 5 intentos/15 min
  por IP y por `codigo_reserva`.
- **Estado:** `❌`

---

## Bloque 3 — Pendiente de implementación

### CP-FA3-006 — Dashboard de métricas administrador
- **Estado:** `🚧` RF-USA-05 no implementado en MVP. Sólo la gestión de salas está.

### CP-FA4-006 — Cron Job anonimización (Ley 21.719)
- **Estado:** `🚧` No implementado. Requiere criterio jurídico + scripts/90/fase4 afirmar
  NO_IMPL.

### CP-FA4-020 — Cola de sincronización offline en Service Worker
- **Estado:** `🚧` El SW actual cubre navegación y fallback de caché, no hay Background Sync API.

---

## Matriz de estado

| ID | Estado hoja manual | Prioridad |
|---|---|---|
| CP-FA1-012 | ⏸ | Must |
| CP-FA2-004 | ⏸ | Must |
| CP-FA3-003 | ⏸ | Must |
| CP-FA3-004 | ⏸ | Must |
| CP-FA3-009 | ⏸ | Must |
| CP-FA3-010 | ⏸ | Must |
| CP-FA3-011 | ⏸ | Should |
| CP-FA3-013 | ⏸ | Must |
| CP-FA4-002 | ⏸ | Should |
| CP-FA4-003 | ⏸ | Should |
| CP-FA4-005 | ⏸ | Must |
| CP-FA4-008 | ⏸ | Must |
| CP-FA4-021 | ⏸ | Must |
| CP-FA1-015 | ❌ | Must |
| CP-FA2-020 | ❌ | Must |
| CP-FA3-016 | ❌ | Must |
| CP-FA3-006 | 🚧 | Could |
| CP-FA4-006 | 🚧 | Must |
| CP-FA4-020 | 🚧 | Should |
