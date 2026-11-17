const fs = require('fs');
const path = require('path');

const testCases = [
  // --- FASE 1: 22 CASOS (12 originales + 10 integrados) ---
  {
    id: 'CP-FA1-001',
    fase: 'Fase 1',
    ref: 'RF-SEC-06 / ISO 27002',
    categoria: 'Seguridad',
    nombre: 'Verificación Hashing Argon2id en DB Institucional',
    pre: 'DB-Institucional en Supabase con RLS.',
    pasos: '1. Insertar usuario test. 2. Consultar password_hash en SQL.',
    cmd: 'npx argon2-cli -v argon2id',
    criterio: 'Hash inicia con $argon2id$v=19$m=65536. Cero texto plano.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-002',
    fase: 'Fase 1',
    ref: 'RF-SEC-11 / RLS',
    categoria: 'Seguridad',
    nombre: 'Aisle RLS en usuarios_institucion ante anon key',
    pre: 'RLS habilitado en usuarios_institucion.',
    pasos: '1. Consulta HTTP REST sin token JWT usando anon key.',
    cmd: "curl -X GET 'https://[INST].supabase.co/rest/v1/usuarios_institucion'",
    criterio: 'Respuesta HTTP 401 o array vacío []. Bloqueo efectivo.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-003',
    fase: 'Fase 1',
    ref: 'Singleton / GoF',
    categoria: 'Arquitectura',
    nombre: 'Instancia Única GestorConexionBD Institucional',
    pre: 'Backend Next.js activo.',
    pasos: '1. Invocar GestorConexionBD.getInstance() 100 veces.',
    cmd: 'npm run test:unit -- gestorConexion.test.ts',
    criterio: 'Misma referencia en memoria para las 100 llamadas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-004',
    fase: 'Fase 1',
    ref: 'Singleton / GoF',
    categoria: 'Arquitectura',
    nombre: 'Instancia Única GestorConexionBD Reservas',
    pre: 'Backend Next.js activo.',
    pasos: '1. Invocar cliente Supabase Reservas 100 veces.',
    cmd: 'npm run test:unit -- gestorReservas.test.ts',
    criterio: 'Misma referencia de conexión a DB-Reservas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-005',
    fase: 'Fase 1',
    ref: 'OWASP A03 / InjSQL',
    categoria: 'Seguridad',
    nombre: 'Prevención de Inyección SQL en Login RUT',
    pre: 'Pantalla/API Login activa.',
    pasos: "1. Enviar RUT: ' OR '1'='1 en el formulario.",
    cmd: 'npm run test:unit -- authSqlInjection.test.ts',
    criterio: 'Consulta parametrizada rechaza el intento con error HTTP 400.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-006',
    fase: 'Fase 1',
    ref: 'OWASP A07 / Auth',
    categoria: 'Seguridad',
    nombre: 'Bloqueo por Fuerza Bruta tras 5 Intentos Fallidos',
    pre: 'Usuario registrado en DB.',
    pasos: '1. Enviar 5 contraseñas erróneas en menos de 1 min.',
    cmd: 'npm run test:unit -- bruteForce.test.ts',
    criterio: 'Cuenta bloqueada temporalmente por 15 min. HTTP 429.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-007',
    fase: 'Fase 1',
    ref: 'RF-FUN-01 / RN01',
    categoria: 'Funcional',
    nombre: 'Creación Exitosa de Reserva por Alumno',
    pre: 'Alumno autenticado en PWA.',
    pasos: '1. Seleccionar sala LAB-01, fecha y bloque 3.',
    cmd: 'npm run test:e2e -- createReserva.spec.ts',
    criterio: "Reserva creada con estado 'confirmada' en T < 1s.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-008',
    fase: 'Fase 1',
    ref: 'RF-PER-10 / RN02',
    categoria: 'Concurrencia',
    nombre: 'Control Concurrente de Solape (HTTP 409)',
    pre: 'Sala LAB-01 libre.',
    pasos: '1. Enviar 2 peticiones idénticas a la misma milésima.',
    cmd: 'k6 run --vus 10 --duration 5s tests/k6/concurrency.js',
    criterio: '1ra confirma (201). 2da rechaza con HTTP 409 Conflict.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-009',
    fase: 'Fase 1',
    ref: 'Ley 21.719',
    categoria: 'Seguridad',
    nombre: 'Ocultamiento de password_hash en respuestas API',
    pre: 'Endpoint GET /api/usuario/perfil.',
    pasos: '1. Consultar perfil de usuario activo via API.',
    cmd: "curl -X GET 'https://app/api/usuario/me'",
    criterio: 'JSON retornado omite estrictamente la clave password_hash.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-010',
    fase: 'Fase 1',
    ref: 'ISO 27002 / JWT',
    categoria: 'Seguridad',
    nombre: 'Validación de Expiración de Token JWT Session',
    pre: 'JWT generado hace > 60 min.',
    pasos: '1. Intentar reservar con token expirado.',
    cmd: 'npm run test:unit -- jwtExpiry.test.ts',
    criterio: 'Respuesta HTTP 401 Unauthorized (Token expired).',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-011',
    fase: 'Fase 1',
    ref: 'RNF-SEC-05',
    categoria: 'Seguridad',
    nombre: 'Cookies de Sesión con Flags Secure y HttpOnly',
    pre: 'Login exitoso en navegador.',
    pasos: '1. Inspeccionar Set-Cookie header en respuesta HTTP.',
    cmd: "curl -I -X POST 'https://app/api/auth/login'",
    criterio: 'Cookie contiene HttpOnly; Secure; SameSite=Strict.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-012',
    fase: 'Fase 1',
    ref: 'RF-USA-06',
    categoria: 'Usabilidad',
    nombre: 'Precarga Inmutable de Datos de Sesión (ReadOnly)',
    pre: 'Usuario autenticado en Wizard.',
    pasos: '1. Abrir paso de confirmación en el Wizard.',
    cmd: 'npx playwright test tests/e2e/readonlySession.spec.ts',
    criterio: 'Nombre y correo precargados con atributo disabled/readonly.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  // Nuevas adiciones Fase 1 (10 casos)
  {
    id: 'CP-FA1-013',
    fase: 'Fase 1',
    ref: 'OWASP A07 / Auth',
    categoria: 'Seguridad',
    nombre: 'Rechazo de Login con Credenciales Erróneas y Mensaje Opaco',
    pre: 'Usuario registrado activo en DB Institucional.',
    pasos: '1. Enviar POST /api/auth/login con contraseña incorrecta.',
    cmd: "curl -s -X POST 'https://app/api/auth/login' -d '{\"rut\":\"18.123.456-7\",\"pass\":\"badpass\"}'",
    criterio: 'HTTP 401 Unauthorized con mensaje genérico ("Credenciales inválidas"). Sin indicar si falló usuario o clave.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-014',
    fase: 'Fase 1',
    ref: 'OWASP A07 / Ley 21.719',
    categoria: 'Seguridad',
    nombre: 'Prevención de Enumeración de Usuarios en Endpoint Login',
    pre: 'Backend Next.js activo.',
    pasos: '1. Medir tiempo de respuesta con usuario existente vs inexistente.',
    cmd: 'npm run test:unit -- loginUserEnumeration.test.ts',
    criterio: 'Misma respuesta HTTP 401 y delta temporal delta_t < 50ms para prevenir timing attacks.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-015',
    fase: 'Fase 1',
    ref: 'OWASP A07 / Session',
    categoria: 'Seguridad',
    nombre: 'Invalidación y Cierre de Sesión Seguro (Logout)',
    pre: 'Sesión iniciada con cookie HttpOnly.',
    pasos: '1. Enviar POST /api/auth/logout. 2. Intentar consultar ruta protegida con token previo.',
    cmd: "curl -b cookies.txt -X POST 'https://app/api/auth/logout'",
    criterio: 'Header Set-Cookie con Max-Age=0. Token invalidado y siguiente petición rechazada con HTTP 401.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-016',
    fase: 'Fase 1',
    ref: 'OWASP A01 / BOLA',
    categoria: 'Seguridad',
    nombre: 'Rechazo de Petición sin Header Authorization o Cookie en Rutas Protegidas',
    pre: 'Usuario anónimo sin sesión.',
    pasos: '1. Enviar GET /api/usuario/me y GET /api/reservas sin credenciales.',
    cmd: "curl -i -X GET 'https://app/api/reservas'",
    criterio: 'HTTP 401 Unauthorized inmediato sin procesar lógica interna ni fugar datos.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-017',
    fase: 'Fase 1',
    ref: 'OWASP A08 / Tampering',
    categoria: 'Seguridad',
    nombre: 'Rechazo de Cookie de Sesión Manipulada o sin Firma Criptográfica',
    pre: 'Middleware Next.js activo.',
    pasos: '1. Alterar valor de RUT o firma criptográfica HMAC en cookie de sesión.',
    cmd: "curl -H 'Cookie: session=tampered.fake.sig' https://app/api/reservas",
    criterio: 'Middleware detecta firma criptográfica inválida y rechaza con HTTP 401.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-018',
    fase: 'Fase 1',
    ref: 'OWASP A02 / ISO 27002',
    categoria: 'Seguridad',
    nombre: 'Prohibición Absoluta de Fallback de Contraseñas en Texto Plano',
    pre: 'Usuario con hash corrupto en DB.',
    pasos: '1. Intentar validar acceso con coincidencia exacta en texto plano.',
    cmd: 'npm run test:unit -- zeroPlaintextFallback.test.ts',
    criterio: 'Sistema rechaza tajantemente la autenticación. Verificación exclusiva vía Argon2id.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-019',
    fase: 'Fase 1',
    ref: 'Ley 21.719 / Privacidad',
    categoria: 'Seguridad',
    nombre: 'Prevención de Fuga de Datos Personales en /api/usuarios/validar',
    pre: 'Endpoint de validación de directorio activo.',
    pasos: '1. Invocar validación con RUT de prueba institucional.',
    cmd: "curl -s -X POST 'https://app/api/usuarios/validar' -d '{\"rut\":\"19888777-6\"}'",
    criterio: 'Retorna estrictamente {"exists":true,"activo":true}. Cero nombres, correos o datos privados expuestos.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-020',
    fase: 'Fase 1',
    ref: 'RF-SEC-11 / ISO 29119',
    categoria: 'Funcional',
    nombre: 'Autenticación Exitosa Multi-Rol (Alumno, Docente, Encargado)',
    pre: 'Usuarios activos en DB Institucional con roles asignados.',
    pasos: '1. Iniciar sesión con RUT y contraseña para cada perfil.',
    cmd: 'npm run test:unit -- multiRoleAuth.test.ts',
    criterio: 'Emisión exitosa de sesión HTTP 200 con asignación estricta de claims de rol correspondientes.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-021',
    fase: 'Fase 1',
    ref: 'OWASP A04 / Rate Limit',
    categoria: 'Seguridad',
    nombre: 'Rate Limiting por Dirección IP en Login (/api/auth/login)',
    pre: 'Endpoint login activo.',
    pasos: '1. Enviar ráfaga de 30 peticiones concurrentes desde la misma IP en 2 segundos.',
    cmd: 'k6 run --vus 5 --duration 2s tests/k6/loginRateLimit.js',
    criterio: 'Respuesta HTTP 429 Too Many Requests al sobrepasar el límite configurado.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA1-022',
    fase: 'Fase 1',
    ref: 'RF-SEC-11 / RLS',
    categoria: 'Seguridad',
    nombre: 'Aislamiento RLS en DB-Reservas ante Invocación con Clave Anónima',
    pre: 'DB-Reservas en Supabase con RLS activo.',
    pasos: '1. Realizar consulta REST a tabla reservas usando clave anon pública.',
    cmd: "curl -X GET 'https://[RES].supabase.co/rest/v1/reservas'",
    criterio: 'Respuesta HTTP 401 Unauthorized o array vacío []. PostgREST impide lectura sin backend autenticado.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },

  // --- FASE 2: 25 CASOS (14 originales + 11 integrados) ---
  {
    id: 'CP-FA2-001',
    fase: 'Fase 2',
    ref: 'RF-FUN-07 / RN04',
    categoria: 'Funcional',
    nombre: 'Rechazo de Asistente con Correo Externo (@gmail)',
    pre: 'Wizard en Paso 4 (Asistentes).',
    pasos: "1. Agregar asistente 'juan@gmail.com'.",
    cmd: 'npm run test:unit -- validateAssistants.test.ts',
    criterio: "Bloquea envío: 'Asistentes deben ser @institucion.cl'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-002',
    fase: 'Fase 2',
    ref: 'RF-FUN-07 / RN04',
    categoria: 'Funcional',
    nombre: 'Rechazo de Asistente Inactivo en Directorio',
    pre: 'Wizard en Paso 4.',
    pasos: '1. Agregar correo con estado_activo = false.',
    cmd: 'npm run test:unit -- inactiveUser.test.ts',
    criterio: "Bloquea envío: 'El usuario no se encuentra activo'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-003',
    fase: 'Fase 2',
    ref: 'Motor Penalización',
    categoria: 'Regla Negocio',
    nombre: 'Bloqueo Automático 1 Semana tras 3 Ausencias',
    pre: 'Usuario con 2 ausencias.',
    pasos: '1. Marcar 3ra falta consecutiva.',
    cmd: 'npx ts-node scripts/triggerPenalization.ts',
    criterio: 'bloqueado_hasta fijado a +7 días. HTTP 403 al reservar.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-004',
    fase: 'Fase 2',
    ref: 'Motor Penalización',
    categoria: 'Regla Negocio',
    nombre: 'Reset Contador de Ausencias por Check-in Exitoso',
    pre: 'Usuario con 2 ausencias.',
    pasos: '1. Confirmar asistencia presencial via QR.',
    cmd: 'npm run test:unit -- penalizationReset.test.ts',
    criterio: 'ausencias_acumuladas se resetea a 0 en la BD.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-005',
    fase: 'Fase 2',
    ref: 'RF-FUN-12 / Factory',
    categoria: 'Arquitectura',
    nombre: 'Autogeneración Siglas AAA-00 (SalaFactory)',
    pre: 'Admin en panel de salas.',
    pasos: "1. Crear sala 'Lab IA', tipo 'lab', piso 2.",
    cmd: 'npm run test:unit -- salaFactory.test.ts',
    criterio: "SalaFactory consulta BD y asigna sigla incremental 'LAB-04'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-006',
    fase: 'Fase 2',
    ref: 'RF-FUN-12 / Factory',
    categoria: 'Arquitectura',
    nombre: 'Generación Sigla Auditorio (AUD-01)',
    pre: 'Admin en panel de salas.',
    pasos: "1. Crear recinto 'Auditorio Magno', tipo 'aud'.",
    cmd: 'npm run test:unit -- salaFactoryAud.test.ts',
    criterio: "Asigna automáticamente la sigla 'AUD-01'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-007',
    fase: 'Fase 2',
    ref: 'RF-SEC-03 / RN03',
    categoria: 'Seguridad',
    nombre: 'Intento de Cancelación Ajena (HTTP 403)',
    pre: 'Reserva activa del Alumno A.',
    pasos: '1. Alumno B envía DELETE /api/reservas/RES-1042.',
    cmd: "curl -X DELETE 'https://app/api/reservas/RES-1042' -H 'Auth: Bearer B'",
    criterio: 'HTTP 403 Forbidden. Reserva permanece intacta.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-008',
    fase: 'Fase 2',
    ref: 'RF-FUN-02',
    categoria: 'Funcional',
    nombre: 'Edición de Reserva Propia por Docente',
    pre: 'Docente con reserva activa.',
    pasos: '1. Cambiar bloque horario a un bloque libre.',
    cmd: 'npx playwright test tests/e2e/docenteEdit.spec.ts',
    criterio: 'Reserva se actualiza exitosamente en BD-Reservas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-009',
    fase: 'Fase 2',
    ref: 'RF-FUN-02 / RN01',
    categoria: 'Funcional',
    nombre: 'Rechazo de Edición por Solape en Destino',
    pre: 'Docente intenta mover reserva.',
    pasos: '1. Seleccionar bloque ocupado por otra clase.',
    cmd: 'npm run test:unit -- docenteConflict.test.ts',
    criterio: 'Muestra alerta de conflicto. Mantiene reserva previa intacta.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-010',
    fase: 'Fase 2',
    ref: 'Validación Aforo',
    categoria: 'Regla Negocio',
    nombre: 'Bloqueo si Asistentes Superan Aforo de Sala',
    pre: 'Sala con aforo max 20.',
    pasos: '1. Intentar reservar para 25 asistentes.',
    cmd: 'npx playwright test tests/e2e/aforoExceeded.spec.ts',
    criterio: "Formulario bloquea botón 'Confirmar' con mensaje explicativo.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-011',
    fase: 'Fase 2',
    ref: 'OWASP A03 / XSS',
    categoria: 'Seguridad',
    nombre: "Sanitización de HTML en Campo 'Propósito'",
    pre: 'Formulario de reserva.',
    pasos: "1. Ingresar en propósito: <script>alert('xss')</script>.",
    cmd: 'npm run test:unit -- xssSanitize.test.ts',
    criterio: 'Texto se sanitiza/escapa. No se ejecuta JS en frontend.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-012',
    fase: 'Fase 2',
    ref: 'Usabilidad / UX',
    categoria: 'Usabilidad',
    nombre: 'Mensaje Claro de Conflicto en UI ante HTTP 409',
    pre: 'Reserva rechazada por solape.',
    pasos: '1. Simular respuesta 409 desde el backend.',
    cmd: 'npx playwright test tests/e2e/conflictUI.spec.ts',
    criterio: "Muestra banner rojo: 'El horario seleccionado acaba de ser ocupado'.",
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA2-013',
    fase: 'Fase 2',
    ref: 'Control Dominio',
    categoria: 'Seguridad',
    nombre: 'Validación Dominio Docente @institucion.cl',
    pre: 'Login de Docente.',
    pasos: '1. Autenticar con correo institucional válido.',
    cmd: 'npm run test:unit -- docenteAuth.test.ts',
    criterio: "Rol asignado correctamente como 'docente' en sesión.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-014',
    fase: 'Fase 2',
    ref: 'Regla Cero Asistentes',
    categoria: 'Regla Negocio',
    nombre: 'Bloqueo de Reserva con 0 Asistentes',
    pre: 'Formulario de reserva.',
    pasos: '1. Dejar campo asistentes en 0.',
    cmd: 'npx playwright test tests/e2e/zeroAssistants.spec.ts',
    criterio: "Botón desactivado: 'Debe declarar al menos 1 asistente'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  // Nuevas adiciones Fase 2 (11 casos)
  {
    id: 'CP-FA2-015',
    fase: 'Fase 2',
    ref: 'OWASP A01 / BFLA',
    categoria: 'Seguridad',
    nombre: 'Control RBAC: Alumno Intentando Invocar Endpoint Admin (POST /api/salas)',
    pre: 'Sesión activa con rol Alumno.',
    pasos: '1. Alumno envía POST /api/salas con datos de nueva sala.',
    cmd: "curl -b alumno.cookie -X POST 'https://app/api/salas' -d '{\"sigla\":\"LAB-99\"}'",
    criterio: 'HTTP 403 Forbidden. Operación restringida exclusivamente a administradores.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-016',
    fase: 'Fase 2',
    ref: 'OWASP A01 / BFLA',
    categoria: 'Seguridad',
    nombre: 'Control RBAC: Docente Intentando Crear o Eliminar Salas (POST/DELETE /api/salas)',
    pre: 'Sesión activa con rol Docente.',
    pasos: '1. Docente envía POST /api/salas intentando registrar recinto.',
    cmd: "curl -b docente.cookie -X POST 'https://app/api/salas' -d '{\"sigla\":\"AUD-02\"}'",
    criterio: 'HTTP 403 Forbidden. Creación/eliminación de salas bloqueada para docentes.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-017',
    fase: 'Fase 2',
    ref: 'OWASP A01 / RBAC',
    categoria: 'Seguridad',
    nombre: 'Control RBAC: Alumno Intentando Endpoint de Reserva a Terceros',
    pre: 'Sesión activa con rol Alumno.',
    pasos: '1. Alumno envía POST /api/reservas/terceros indicando RUT de otro estudiante.',
    cmd: "curl -b alumno.cookie -X POST 'https://app/api/reservas/terceros' -d '{\"rut_alumno\":\"17.999.888-2\"}'",
    criterio: 'HTTP 403 Forbidden. Endpoint reservado para Encargados de Laboratorio.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-018',
    fase: 'Fase 2',
    ref: 'RF-FUN-12 / Integración',
    categoria: 'Funcional',
    nombre: 'Rechazo de Creación de Sala con Sigla o Acrónimo Duplicado',
    pre: 'Sala con sigla LAB-01 ya registrada en BD.',
    pasos: "1. Admin intenta registrar nueva sala usando sigla 'LAB-01'.",
    cmd: 'npm run test:unit -- salaDuplicada.test.ts',
    criterio: "HTTP 409 Conflict o 400 Bad Request. 'La sigla de sala ya se encuentra registrada'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-019',
    fase: 'Fase 2',
    ref: 'RF-FUN-12 / Robustez',
    categoria: 'Validación',
    nombre: 'Rechazo de Capacidad de Sala Negativa o Cero en Backend',
    pre: 'Admin autenticado en panel de salas.',
    pasos: '1. Enviar payload de sala con capacidad: -5 o capacidad: 0.',
    cmd: "curl -b admin.cookie -X POST 'https://app/api/salas' -d '{\"nombre\":\"Lab X\",\"capacidad\":-5}'",
    criterio: 'HTTP 422 Unprocessable Entity con validación de esquema Zod en backend.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-020',
    fase: 'Fase 2',
    ref: 'RF-FUN-01 / RN01',
    categoria: 'Regla Negocio',
    nombre: 'Rechazo de Creación de Reserva en Horario o Bloque en el Pasado',
    pre: 'PWA o API de reservas activa.',
    pasos: '1. Enviar POST /api/reservas con fecha de ayer o bloque concluido.',
    cmd: 'npm run test:unit -- pastReservation.test.ts',
    criterio: "HTTP 400 Bad Request. Mensaje: 'No es posible reservar bloques en el pasado'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-021',
    fase: 'Fase 2',
    ref: 'RF-FUN-02 / RN02',
    categoria: 'Regla Negocio',
    nombre: 'Rechazo de Solape de Horario Personal de Usuario (Mismo Docente)',
    pre: 'Docente con reserva activa confirmada en bloque 3.',
    pasos: '1. Intentar reservar una segunda sala distinta para el mismo bloque 3.',
    cmd: 'npm run test:unit -- personalScheduleConflict.test.ts',
    criterio: "HTTP 409 Conflict. Mensaje: 'Ya posee una reserva confirmada en este bloque'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-022',
    fase: 'Fase 2',
    ref: 'RN-05 / Penalización',
    categoria: 'Regla Negocio',
    nombre: 'Bloqueo en Backend a Usuario en Estado Penalizado al Reservar',
    pre: 'Usuario con registro de penalización activa en BD.',
    pasos: '1. Usuario penalizado envía POST /api/reservas.',
    cmd: "curl -b penalizado.cookie -X POST 'https://app/api/reservas'",
    criterio: 'HTTP 403 Forbidden. Retorna mensaje explicativo con fecha exacta de liberación.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-023',
    fase: 'Fase 2',
    ref: 'RF-SEC-03 / ISO 29119',
    categoria: 'Funcional',
    nombre: 'Cancelación Exitosa de Reserva Propia y Liberación de Bloque',
    pre: 'Usuario con reserva activa propia.',
    pasos: '1. Enviar DELETE /api/reservas/{id_propio}.',
    cmd: "curl -b user.cookie -X DELETE 'https://app/api/reservas/RES-5501'",
    criterio: "HTTP 200 OK. Estado pasa a 'cancelada' y bloque queda inmediatamente libre para terceros.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-024',
    fase: 'Fase 2',
    ref: 'RF-SEC-03 / Idempotencia',
    categoria: 'Integración',
    nombre: 'Control de Idempotencia: Rechazo de Cancelación sobre Reserva Inactiva',
    pre: 'Reserva previamente cancelada.',
    pasos: '1. Re-enviar DELETE /api/reservas/{id_cancelado}.',
    cmd: "curl -b user.cookie -X DELETE 'https://app/api/reservas/RES-5501'",
    criterio: "HTTP 400 Bad Request o 404 Not Found. 'La reserva ya se encuentra inactiva o cancelada'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA2-025',
    fase: 'Fase 2',
    ref: 'OWASP A04 / Concurrencia',
    categoria: 'Concurrencia',
    nombre: 'Protección ante Doble Clic Rápido en Cancelación (Race Condition)',
    pre: 'Reserva activa en interfaz PWA.',
    pasos: '1. Disparar 2 peticiones DELETE concurrentes en menos de 5ms.',
    cmd: 'npm run test:unit -- doubleCancelRace.test.ts',
    criterio: 'Una petición responde 200 OK y la segunda es rechazada; BD mantiene consistencia absoluta.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },

  // --- FASE 3: 22 CASOS (12 originales + 10 integrados) ---
  {
    id: 'CP-FA3-001',
    fase: 'Fase 3',
    ref: 'RF-SEC-04',
    categoria: 'Funcional',
    nombre: 'Reserva a Terceros por Encargado Administrativo',
    pre: 'Encargado en su panel especial.',
    pasos: '1. Ingresar RUT de alumno y reservar sala.',
    cmd: 'npx playwright test tests/e2e/adminThirdParty.spec.ts',
    criterio: 'Reserva creada. Registro generado en bitacora_administrativa.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-002',
    fase: 'Fase 3',
    ref: 'RF-SEC-04',
    categoria: 'Auditoría',
    nombre: 'Verificación Trazabilidad Bitácora Administrativa',
    pre: 'Reserva a tercero completada.',
    pasos: '1. Consultar tabla bitacora_administrativa en SQL.',
    cmd: 'supabase db remote commit',
    criterio: 'Fila contiene encargado_rut, rut_estudiante y timestamp exacto.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-003',
    fase: 'Fase 3',
    ref: 'RF-CON-13',
    categoria: 'Funcional',
    nombre: 'Check-in de Asistencia via Escaneo QR CÁMARA',
    pre: 'Reserva activa en bloque actual.',
    pasos: '1. Escanear QR físico de la sala con la PWA.',
    cmd: 'npx playwright test tests/e2e/qrCamera.spec.ts',
    criterio: "Estado pasa a 'completada' y guarda timestamp de asistencia.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-004',
    fase: 'Fase 3',
    ref: 'RF-CON-13',
    categoria: 'Funcional',
    nombre: 'Check-in Contingencia via Código Manual 6 Dígitos',
    pre: 'Reserva activa en bloque actual.',
    pasos: "1. Seleccionar 'No puedo usar cámara' e ingresar 6 dígitos.",
    cmd: 'npx playwright test tests/e2e/qrManual.spec.ts',
    criterio: 'Valida código y marca asistencia confirmada exitosamente.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-005',
    fase: 'Fase 3',
    ref: 'RF-PER-08 / Observer',
    categoria: 'Arquitectura',
    nombre: 'Despacho Asíncrono de Correo con Adjunto .ics',
    pre: 'Reserva confirmada.',
    pasos: '1. Observer NotificadorICS captura evento.',
    cmd: 'npm run test:unit -- observerICS.test.ts',
    criterio: 'UI responde en < 1s. Correo con .ics llega en T <= 120s.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA3-006',
    fase: 'Fase 3',
    ref: 'RF-USA-05',
    categoria: 'Dashboard',
    nombre: 'Renderizado Metrics Dashboard Administrador',
    pre: 'Admin autenticado en /dashboard.',
    pasos: '1. Cargar vista de métricas y aplicar filtro.',
    cmd: 'npx playwright test tests/e2e/dashboard.spec.ts',
    criterio: 'Renderiza en T < 2s ocupación diaria, desglose y ranking.',
    estado: '',
    prioridad: 'Could',
    evidencia: ''
  },
  {
    id: 'CP-FA3-007',
    fase: 'Fase 3',
    ref: 'PWA Offline',
    categoria: 'Usabilidad',
    nombre: 'Detección de Pérdida de Conexión (Offline Banner)',
    pre: 'PWA abierta en móvil.',
    pasos: '1. Desactivar red/WiFi durante navegación.',
    cmd: 'npx playwright test tests/e2e/pwaOffline.spec.ts',
    criterio: "Muestra banner: 'Sin conexión. Los cambios se sincronizarán'.",
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA3-008',
    fase: 'Fase 3',
    ref: 'PWA Install',
    categoria: 'Usabilidad',
    nombre: 'Prompt de Instalación PWA (Manifest.json)',
    pre: 'PWA accedida por navegador.',
    pasos: '1. Verificar presencia de manifest.json y ServiceWorker.',
    cmd: 'npx lighthouse-ci collect',
    criterio: "Navegador ofrece botón 'Instalar Aplicación' en inicio.",
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA3-009',
    fase: 'Fase 3',
    ref: 'WCAG 2.1',
    categoria: 'Accesibilidad',
    nombre: 'Navegación Completa por Teclado (Tab / Enter)',
    pre: 'Wizard de reservas abierto.',
    pasos: '1. Navegar los 4 pasos usando exclusivamente la tecla TAB.',
    cmd: 'npx playwright test tests/e2e/keyboardNav.spec.ts',
    criterio: 'Foco visible en cada elemento (outline de 2px). Sin trampas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-010',
    fase: 'Fase 3',
    ref: 'WCAG 2.1',
    categoria: 'Accesibilidad',
    nombre: 'Contraste de Color en Botones y Alertas',
    pre: 'Interfaz en tema Claro y Oscuro.',
    pasos: '1. Auditar contraste con herramientas A11y.',
    cmd: 'npx axe-core',
    criterio: 'Ratio de contraste >= 4.5:1 en todos los textos y botones.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-011',
    fase: 'Fase 3',
    ref: 'RNF-USA-07',
    categoria: 'Usabilidad',
    nombre: 'Validación Tema Oscuro / Claro Responsivo',
    pre: 'App en smartphone.',
    pasos: '1. Alternar switch de tema visual.',
    cmd: 'npx playwright test tests/e2e/themeSwitch.spec.ts',
    criterio: 'Cambia paleta CSS al instante manteniendo legibilidad 100%.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA3-012',
    fase: 'Fase 3',
    ref: 'RF-CON-13 / Security',
    categoria: 'Seguridad',
    nombre: 'Expiración de Código Manual QR (15 Minutos)',
    pre: 'Código manual de 6 dígitos generado.',
    pasos: '1. Intentar validar código transcurridos 20 min.',
    cmd: 'npm run test:unit -- qrExpiry.test.ts',
    criterio: 'Código invalido por expiración. Exige nuevo escaneo.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  // Nuevas adiciones Fase 3 (10 casos)
  {
    id: 'CP-FA3-013',
    fase: 'Fase 3',
    ref: 'RF-CON-13 / Validación',
    categoria: 'Seguridad',
    nombre: 'Rechazo de Check-in con QR Perteneciente a Otra Sala',
    pre: 'Reserva activa en Sala LAB-01.',
    pasos: '1. Escanear código QR físico correspondiente al AUD-01.',
    cmd: 'npx playwright test tests/e2e/qrWrongRoom.spec.ts',
    criterio: "HTTP 400 Bad Request. Alerta: 'El código QR no corresponde al recinto reservado'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-014',
    fase: 'Fase 3',
    ref: 'RF-CON-13 / RN06',
    categoria: 'Regla Negocio',
    nombre: 'Rechazo de Check-in Fuera de Ventana de Tolerancia Temporal',
    pre: 'Reserva activa en bloque horario concluido hace más de 15 minutos.',
    pasos: '1. Intentar registrar check-in presencial.',
    cmd: 'npm run test:unit -- qrToleranceWindow.test.ts',
    criterio: "HTTP 400 Bad Request. Mensaje: 'Ventana de confirmación de asistencia expirada'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-015',
    fase: 'Fase 3',
    ref: 'RF-CON-13 / OWASP A01',
    categoria: 'Seguridad',
    nombre: 'Rechazo de Check-in de Usuario sin Reserva Vigente en el Bloque',
    pre: 'Usuario sin reservas registradas para el día y bloque actual.',
    pasos: '1. Enviar POST /api/checkin con token de sala activa.',
    cmd: "curl -b user.cookie -X POST 'https://app/api/checkin' -d '{\"sala\":\"LAB-01\"}'",
    criterio: "HTTP 404 o 400. 'El usuario no posee reservas activas en este horario para validar'.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-016',
    fase: 'Fase 3',
    ref: 'OWASP A04 / Anti-Brute',
    categoria: 'Seguridad',
    nombre: 'Rate Limiting Estricto en Validación de Código Manual 6 Dígitos',
    pre: 'Endpoint POST /api/checkin/manual activo.',
    pasos: '1. Enviar ráfaga automatizada de 20 intentos con códigos numéricos aleatorios en 10s.',
    cmd: 'k6 run tests/k6/qrManualBruteForce.js',
    criterio: 'HTTP 429 Too Many Requests tras 5 intentos fallidos consecutivos.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-017',
    fase: 'Fase 3',
    ref: 'RN-05 / Cronjob',
    categoria: 'Integración',
    nombre: 'Cronjob de Evaluación de Inasistencia por Bloque Expirado',
    pre: 'Reserva confirmada en bloque recién terminado sin check-in ni cancelación.',
    pasos: '1. Disparar cronjob automático de auditoría de fin de bloque.',
    cmd: 'npx ts-node scripts/cronEvaluateNoShow.ts',
    criterio: "Estado de la reserva pasa a 'inasistencia' y el contador ausencias del usuario suma +1.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-018',
    fase: 'Fase 3',
    ref: 'RN-05 / Cronjob',
    categoria: 'Regla Negocio',
    nombre: 'Cronjob de Penalización Automática al Acumular 3 Inasistencias',
    pre: 'Usuario con 2 inasistencias previas registradas.',
    pasos: '1. Cronjob registra 3ra inasistencia y dispara motor de sanciones.',
    cmd: 'npm run test:unit -- cronPenalizeAccumulation.test.ts',
    criterio: "Usuario pasa automáticamente a estado 'bloqueado' con fecha_liberacion = hoy + 7 días.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-019',
    fase: 'Fase 3',
    ref: 'RN-05 / Cronjob',
    categoria: 'Regla Negocio',
    nombre: 'Cronjob Diario de Desbloqueo Automático por Fin de Penalización',
    pre: 'Usuario bloqueado cuya fecha_liberacion es menor o igual a hoy.',
    pasos: '1. Ejecutar cronjob programado de medianoche.',
    cmd: 'npx ts-node scripts/cronLiftPenalties.ts',
    criterio: "Estado del usuario se restaura a 'activo' y ausencias_acumuladas se reinicia a 0.",
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-020',
    fase: 'Fase 3',
    ref: 'RF-SEC-04 / Auditoría',
    categoria: 'Funcional',
    nombre: 'Cancelación Administrativa de Reserva de Alumno por Encargado',
    pre: 'Reserva de alumno activa en sistema.',
    pasos: '1. Encargado ejecuta DELETE /api/reservas/{id_alumno} desde su panel.',
    cmd: 'npx playwright test tests/e2e/adminCancelBooking.spec.ts',
    criterio: 'HTTP 200 OK. Bitácora registra ID de reserva, motivo, rut_encargado y timestamp exacto.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-021',
    fase: 'Fase 3',
    ref: 'OWASP A02 / CSPRNG',
    categoria: 'Seguridad',
    nombre: 'Generación Criptográficamente Segura de Token QR y Código Manual',
    pre: 'Servicio de generación de credenciales efímeras.',
    pasos: '1. Generar lote de 10.000 tokens QR y códigos numéricos de 6 dígitos.',
    cmd: 'npm run test:unit -- csprngCodeQuality.test.ts',
    criterio: 'Entropía robusta basada en crypto.randomBytes; cero colisiones y cero predictibilidad algorítmica.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA3-022',
    fase: 'Fase 3',
    ref: 'RF-PER-08 / Observer',
    categoria: 'Arquitectura',
    nombre: 'Resiliencia de Observer ante Falla en Servicio SMTP / Notificaciones',
    pre: 'Servidor SMTP o microservicio de correos simulado como inalcanzable.',
    pasos: '1. Confirmar reserva desde la interfaz PWA.',
    cmd: 'npm run test:unit -- observerResilience.test.ts',
    criterio: 'Reserva se confirma en BD y UI responde en T < 1s; fallo de correo no revierte reserva y se encola reintento.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },

  // --- FASE 4: 21 CASOS (12 originales + 9 integrados) ---
  {
    id: 'CP-FA4-001',
    fase: 'Fase 4',
    ref: 'RNF-PER-02',
    categoria: 'Performance',
    nombre: 'Carga Concurrente (100 Usuarios JMeter)',
    pre: 'Staging en Vercel.',
    pasos: '1. Simular 100 usuarios realizando reservas por 5 min.',
    cmd: 'jmeter -n -t tests/jmeter/load_test.jmx -l res.jtl',
    criterio: '95% de peticiones responden con T <= 3s. Cero caídas.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA4-002',
    fase: 'Fase 4',
    ref: 'RNF-USA-07',
    categoria: 'Usabilidad',
    nombre: 'Puntaje Mobile Lighthouse >= 90',
    pre: 'URL de Staging activa.',
    pasos: '1. Ejecutar Lighthouse CI en modo Mobile.',
    cmd: 'npx lhci autorun',
    criterio: 'Puntaje de Rendimiento y Usabilidad Mobile >= 90.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA4-003',
    fase: 'Fase 4',
    ref: 'RNF-USA-07',
    categoria: 'Usabilidad',
    nombre: 'Scroll Horizontal Nulo en Viewport 360px',
    pre: 'PWA en pantalla 360px ancho.',
    pasos: '1. Revisar wizard y tablas de reservas.',
    cmd: 'npx playwright test tests/e2e/viewport360.spec.ts',
    criterio: 'Cero desbordamiento de scroll horizontal en 360px.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA4-004',
    fase: 'Fase 4',
    ref: 'RNF-SEC-05 / Ley 21.719',
    categoria: 'Seguridad',
    nombre: 'Auditoría Cifrado Tránsito TLS 1.3',
    pre: 'Dominio activo en Vercel.',
    pasos: '1. Ejecutar escaneo de protocolo SSL/TLS.',
    cmd: 'testssl.sh --tls13 https://app.cl',
    criterio: 'Forzado TLS 1.3 estricto. Cero algoritmos obsoletos.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-005',
    fase: 'Fase 4',
    ref: 'RNF-SEC-05',
    categoria: 'Seguridad',
    nombre: 'Cifrado en Reposo AES-256 en Supabase DB',
    pre: 'Base de Datos en Supabase Cloud.',
    pasos: '1. Verificar configuración de almacenamiento en nube.',
    cmd: 'supabase status',
    criterio: 'Disco cifrado mediante AES-256 en reposo verificado.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-006',
    fase: 'Fase 4',
    ref: 'RNF-SEC-06 / Ley 21.719',
    categoria: 'Seguridad',
    nombre: 'Ejecución Cron Job Anonymize (1 Diciembre)',
    pre: 'Historial con reservas > 1 año.',
    pasos: '1. Ejecutar función de purga/disociación.',
    cmd: 'npx ts-node scripts/cronAnonymize.ts',
    criterio: 'Disocia irreversiblemente RUT y Nombre de reservas antiguas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-007',
    fase: 'Fase 4',
    ref: 'RNF-OPE-04',
    categoria: 'Despliegue',
    nombre: 'Despliegue Automatizado Serverless en Vercel',
    pre: 'Repositorio GitHub conectado.',
    pasos: '1. Hacer push a rama main.',
    cmd: 'git push origin main && vercel --prod',
    criterio: 'Build y deploy automático exitoso sin servidores físicos.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-008',
    fase: 'Fase 4',
    ref: 'RNF-REL-01',
    categoria: 'Fiabilidad',
    nombre: 'Uptime Mensual Cloud >= 99.9%',
    pre: 'Monitoreo de Telemetría Cloud.',
    pasos: '1. Consultar métricas de disponibilidad en Vercel.',
    cmd: 'curl https://api.vercel.com/v6/deployments',
    criterio: 'Disponibilidad registrada del 99.95% en el periodo.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-009',
    fase: 'Fase 4',
    ref: 'OWASP A05',
    categoria: 'Seguridad',
    nombre: 'Cabeceras de Seguridad HTTP (CSP, HSTS, X-Frame)',
    pre: 'PWA desplegada.',
    pasos: '1. Inspeccionar headers en respuesta HTTP de Vercel.',
    cmd: 'curl -I https://app.cl',
    criterio: 'Cabeceras Content-Security-Policy y HSTS presentes.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-010',
    fase: 'Fase 4',
    ref: 'RNF-SCA-03',
    categoria: 'Escalabilidad',
    nombre: 'Escalabilidad Elástica Serverless ante Picos',
    pre: 'Prueba de pico de tráfico.',
    pasos: '1. Enviar ráfaga de 300 peticiones instantáneas.',
    cmd: 'k6 run tests/k6/spike_test.js',
    criterio: 'Vercel auto-escala instancias Serverless sin errores 500.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-011',
    fase: 'Fase 4',
    ref: 'Prueba de Regresión',
    categoria: 'Regresión',
    nombre: 'Re-ejecución Suite Completa Fases 1 a 3',
    pre: 'Entorno Staging listo.',
    pasos: '1. Ejecutar test runner unificado de regresión.',
    cmd: 'npm run test:regression:full',
    criterio: '90 de 90 casos aprobados exitosamente (Pass Rate 100%).',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-012',
    fase: 'Fase 4',
    ref: 'Certificación ISO',
    categoria: 'Calidad',
    nombre: 'Generación de Informe Final de Pruebas ISO 29119',
    pre: 'Matriz de pruebas completada.',
    pasos: '1. Exportar métricas de prueba a informe de auditoría.',
    cmd: 'npx ts-node scripts/generateIsoReport.ts',
    criterio: 'Informe final emitido conforme al estándar ISO/IEC 29119-3.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  // Nuevas adiciones Fase 4 (9 casos)
  {
    id: 'CP-FA4-013',
    fase: 'Fase 4',
    ref: 'OWASP A05 / Misconfig',
    categoria: 'Seguridad',
    nombre: 'Supresión de Stack Traces y Versiones en Errores 404 y 500',
    pre: 'Endpoints Next.js en entorno productivo/Staging.',
    pasos: '1. Provocar excepción 500 forzada y consultar ruta 404 inexistente.',
    cmd: "curl -i 'https://app/api/trigger-test-500'",
    criterio: 'Retorna JSON genérico {"error":"Internal Error"}. Cero stack traces ni versiones expuestas.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-014',
    fase: 'Fase 4',
    ref: 'OWASP A09 / Logging',
    categoria: 'Seguridad',
    nombre: 'Registro Centralizado de Eventos de Seguridad y Excepciones',
    pre: 'Intentos de login fallidos y bloqueos RBAC ejecutados.',
    pasos: '1. Revisar logs estructurados en el servicio de observabilidad.',
    cmd: 'npm run test:unit -- auditLoggingFormat.test.ts',
    criterio: 'Logs contienen timestamp ISO, código de evento, IP anonimizada y severidad sin datos sensibles.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-015',
    fase: 'Fase 4',
    ref: 'OWASP A05 / CORS',
    categoria: 'Seguridad',
    nombre: 'Configuración Restrictiva de CORS en Rutas API Next.js',
    pre: 'Servidor Next.js activo.',
    pasos: '1. Enviar petición con Origin: https://sitio-malicioso.com.',
    cmd: "curl -H 'Origin: https://sitio-malicioso.com' -I https://app/api/reservas",
    criterio: 'Rechazo o ausencia de cabecera Access-Control-Allow-Origin; prohibición de wildcard * con credenciales.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-016',
    fase: 'Fase 4',
    ref: 'OWASP A08 / Integrity',
    categoria: 'Seguridad',
    nombre: 'Validación de Esquema Estricto ante Mass Assignment o Parameter Tampering',
    pre: 'Endpoint POST /api/reservas.',
    pasos: '1. Inyectar campos no autorizados: {"estado":"confirmada_directa","rol":"admin"}.',
    cmd: "curl -b user.cookie -X POST 'https://app/api/reservas' -d '{\"rol\":\"admin\"}'",
    criterio: 'Validador Zod descarta o rechaza campos no autorizados fuera del DTO de entrada.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-017',
    fase: 'Fase 4',
    ref: 'OWASP A01 / Supabase',
    categoria: 'Seguridad',
    nombre: 'Mitigación de Inyección de Filtros Maliciosos en PostgREST RPC',
    pre: 'Rutas de consulta de disponibilidad.',
    pasos: '1. Enviar query strings con operadores PostgREST inyectados (?select=*&id=neq.0).',
    cmd: 'npm run test:unit -- postgrestInjection.test.ts',
    criterio: 'Parámetros sanitizados y tipados estrictamente en el backend antes de llamar a supabase-js.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-018',
    fase: 'Fase 4',
    ref: 'OWASP A10 / CSRF',
    categoria: 'Seguridad',
    nombre: 'Protección Anti-CSRF en Server Actions y Mutaciones Next.js',
    pre: 'Sesión activa de usuario.',
    pasos: '1. Simular envío de formulario cross-site sin header Origin válido.',
    cmd: 'npm run test:unit -- csrfServerActions.test.ts',
    criterio: 'Next.js Server Actions y SameSite=Strict rechazan mutación externa no confiable.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-019',
    fase: 'Fase 4',
    ref: 'RNF-SEC-05 / Cache',
    categoria: 'Seguridad',
    nombre: 'Cabeceras Cache-Control no-store en Datos Personales y Reservas',
    pre: 'Endpoints de consulta de perfil y reservas.',
    pasos: '1. Inspeccionar headers HTTP de GET /api/usuario/me.',
    cmd: 'curl -I https://app/api/usuario/me',
    criterio: 'Retorna Cache-Control: no-store, no-cache, must-revalidate; evita cacheo intermedio en proxies.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  },
  {
    id: 'CP-FA4-020',
    fase: 'Fase 4',
    ref: 'PWA Offline / ISO 29119',
    categoria: 'Fiabilidad',
    nombre: 'Integridad de Cola de Sincronización en Service Worker ante Reconexión',
    pre: 'PWA con reserva enviada durante corte momentáneo de red.',
    pasos: '1. Generar reserva offline. 2. Restaurar conectividad de red.',
    cmd: 'npx playwright test tests/e2e/pwaSyncQueue.spec.ts',
    criterio: 'Service Worker sincroniza automáticamente al detectar conectividad sin duplicar transacciones.',
    estado: '',
    prioridad: 'Should',
    evidencia: ''
  },
  {
    id: 'CP-FA4-021',
    fase: 'Fase 4',
    ref: 'ISO 25010 / Fiabilidad',
    categoria: 'Fiabilidad',
    nombre: 'Verificación de Integridad y Recuperabilidad de Backups Supabase',
    pre: 'Base de datos en Staging.',
    pasos: '1. Generar backup SQL y validar restauración en instancia aislada.',
    cmd: 'supabase db dump -f backup_test.sql',
    criterio: 'Dump generado íntegramente; restauración en contenedor de prueba exitosa en T < 5 min.',
    estado: '',
    prioridad: 'Must',
    evidencia: ''
  }
];

console.log('Total test cases assembled:', testCases.length);

// ----- Fusionar resultados de la ejecución (si existen) -----
const summaryPath = path.join(__dirname, '..', 'pruebas-ejecucion-90-casos', 'summary.json');
const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf8')) : null;
if (summary) {
  const resultsMap = new Map((summary.resultados || []).map((r) => [r.id, r]));
  const ESTADO_LABEL = {
    PASS: '✅ Aprobado',
    FAIL: '❌ Fallido',
    INFO: 'ℹ️ Informativo',
    NO_EXEC: '⏸ No ejecutado',
    NO_IMPL: '🚧 Pendiente implementación',
    ERROR: '❌ Error',
  };
  for (const tc of testCases) {
    const run = resultsMap.get(tc.id);
    if (run) {
      tc.estado = ESTADO_LABEL[run.status] || run.status || '';
      tc.evidencia = `pruebas-ejecucion-90-casos/${tc.id}.txt + ${tc.id}.png`;
      tc.resultado = String(run.texto || '').replace(/\r?\n/g, ' · ');
    } else {
      tc.resultado = '';
    }
  }
  console.log('Resultados fusionados desde', summaryPath);
} else {
  console.log('summary.json no encontrado: la tabla generará columnas Estado/Evidencia vacías.');
}

// Generate CSV content matching exactly the first table's header and format
function escapeCsv(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('\"') || str.includes('\n') || str.includes('\r')) {
    return '\"' + str.replace(/\"/g, '\"\"') + '\"';
  }
  return str;
}

const header = [
  'ID Caso',
  'Fase Origen',
  'Ref. RF/RNF/ISO',
  'Categoría',
  'Nombre del Caso / Objetivo',
  'Precondiciones',
  'Pasos de Ejecución',
  'Comando / Script / Tool',
  'Criterio de Aceptación (Resultado Esperado)',
  'Estado Ejecución',
  'Prioridad',
  'Ref. Evidencia (Print/Log)',
  'Resultado Obtenido',
];

const lines = [];

// Header metadata rows (identical structure to table 1)
lines.push('PLAN DE PRUEBAS DE SOFTWARE - MARCO ISO/IEC/IEEE 29119-3 & ISO 25010,,,,,,,,,,,');
lines.push('Estrategia de Ejecución Incremental por Fases con Pruebas de Regresión Acumulativa (90 Casos),,,,,,,,,,,');
lines.push(',,,,,,,,,,,');
lines.push('METODOLOGÍA DE EJECUCIÓN INCREMENTAL Y ACUMULATIVA,,,,,,,,,,,');
lines.push('Enfoque Metodológico:,"Pruebas de Regresión Acumulativa (Fase N prueba los casos nuevos + re-ejecuta Fase 1..N-1).",,,,,,,,,,');
lines.push('Estándares de Referencia:,"ISO/IEC/IEEE 29119-3 (Plan y Reporte de Pruebas), ISO/IEC 25010 (Calidad de Software).",,,,,,,,,,');
lines.push('Seguridad y Normativa:,"ISO/IEC 27002:2022 (Argon2id), OWASP Top 10 (A01 a A10) y Ley 21.719 (Protección de Datos).",,,,,,,,,,');
lines.push('Evidencia Exigida:,Cada caso probado exige captura de pantalla/log de ejecución guardado en la carpeta de evidencia de la Fase.,,,,,,,,,,');
lines.push(',,,,,,,,,,,');
lines.push('MATRIZ DE COBERTURA Y REGRESIÓN POR FASE DE DESARROLLO (TOTAL 90 CASOS),,,,,,,,,,,');
lines.push('"Fase 1: Configuración BD, Auth & Singleton",CP-FA1-001 al CP-FA1-022 (22 casos),Ninguno (Fase Inicial),22 ejecuciones,"Validar RLS en BD Dual, Argon2id, Singleton, Auth, Cookies firmadas y no solapes."');
lines.push('"Fase 2: Concurrencia, Reglas, RBAC & Factory",CP-FA2-001 al CP-FA2-025 (25 casos),Fase 1 (22 casos),47 ejecuciones,"Garantizar que nuevos filtros, RBAC estricto y penalizaciones no rompan Auth/RLS."');
lines.push('"Fase 3: Módulos Especiales, QR, Observer & Cronjobs",CP-FA3-001 al CP-FA3-022 (22 casos),Fase 1 + Fase 2 (47 casos),69 ejecuciones,"Validar que PWA, QR físico/manual, CSPRNG y Cronjobs mantengan integridad transaccional."');
lines.push('"Fase 4: Rendimiento, Usabilidad, Vercel & Hardening",CP-FA4-001 al CP-FA4-021 (21 casos),Fase 1 + Fase 2 + Fase 3 (69 casos),90 ejecuciones,"Certificación final de performance (T<=3s), Lighthouse, CORS, Anti-CSRF, TLS 1.3 y Backups."');
lines.push('MATRIZ DE CASOS DE PRUEBA EXPANDIDA (90 CASOS ATÓMICOS - ISO 29119-3),,,,,,,,,,,');
lines.push('Mapeo completo con campos de Evidencia (Print/Log) y Regresión por Fase,,,,,,,,,,,');
lines.push(',,,,,,,,,,,');
lines.push(header.join(','));

testCases.forEach(tc => {
  const row = [
    escapeCsv(tc.id),
    escapeCsv(tc.fase),
    escapeCsv(tc.ref),
    escapeCsv(tc.categoria),
    escapeCsv(tc.nombre),
    escapeCsv(tc.pre),
    escapeCsv(tc.pasos),
    escapeCsv(tc.cmd),
    escapeCsv(tc.criterio),
    escapeCsv(tc.estado),
    escapeCsv(tc.prioridad),
    escapeCsv(tc.evidencia),
    escapeCsv(tc.resultado),
  ];
  lines.push(row.join(','));
});

// Add UTF-8 BOM so Excel opens it with proper accents and formatting directly
const csvContent = '\ufeff' + lines.join('\r\n');

const outputPathDocs = path.join(__dirname, '..', 'docs', 'plan_de_pruebas_90_casos.csv');
fs.writeFileSync(outputPathDocs, csvContent, 'utf8');
console.log('Saved CSV to:', outputPathDocs);

// Also save directly to artifact directory if available
const artifactDir = 'C:\\Users\\allen\\.gemini\\antigravity\\brain\\446916fd-5507-4b42-90bb-1f558886f7be';
if (fs.existsSync(artifactDir)) {
  const artifactPath = path.join(artifactDir, 'plan_de_pruebas_90_casos.csv');
  fs.writeFileSync(artifactPath, csvContent, 'utf8');
  console.log('Saved CSV to artifact dir:', artifactPath);
}
