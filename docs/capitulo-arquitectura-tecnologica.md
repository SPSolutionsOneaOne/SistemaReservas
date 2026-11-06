# Arquitectura tecnológica, datos y comunicaciones

## X.1 Introducción

Este capítulo describe las tecnologías seleccionadas para el Sistema de Reservas Institucional, la organización lógica de sus bases de datos y el recorrido de la información a través de la red. La solución combina una aplicación web desarrollada con Next.js y TypeScript con bases de datos relacionales PostgreSQL administradas por Supabase.

La separación de los datos en dos proyectos permite distinguir la información institucional de identidad y roles de los datos operacionales de salas y reservas. Cada proyecto Supabase dispone de una base PostgreSQL propia; por lo tanto, esta separación constituye una división entre instancias y no solamente entre tablas o esquemas de una misma base. Supabase ofrece acceso a PostgreSQL y una API de datos generada desde el esquema de la base. [1] [2]

## X.2 Base de datos seleccionada

### X.2.1 PostgreSQL administrado por Supabase

Se seleccionó PostgreSQL como motor relacional y Supabase como plataforma administrada. PostgreSQL permite representar entidades vinculadas mediante claves primarias y foráneas, aplicar restricciones a los datos y resolver operaciones transaccionales. Supabase aporta administración del proyecto y una API REST que permite a la aplicación realizar consultas sin abrir una conexión directa desde el navegador al servidor PostgreSQL. [1] [2]

La biblioteca `@supabase/supabase-js` es el cliente usado por el sistema para comunicarse con la API de datos. Las rutas de Next.js envían las solicitudes a Supabase y reciben sus respuestas en formato JSON. La API de datos se basa en PostgREST y opera sobre el esquema PostgreSQL. [2]

### X.2.2 Organización de las bases

**Base DB-Institucional.** Mantiene los datos del padrón utilizados para reconocer a los usuarios y determinar sus permisos. La tabla principal es `usuarios_institucion`, que contiene identificador, RUT, nombre, correo institucional, hash de contraseña, rol, carrera o departamento, estado de actividad y fecha de creación. Los roles contemplados por el sistema son alumno, docente, encargado administrativo y administrador.

**Base DB-Reservas.** Mantiene la operación del sistema y contempla las siguientes tablas:

| Tabla | Propósito | Relaciones y reglas relevantes |
| --- | --- | --- |
| `salas` | Catálogo de espacios reservables, con tipo, aforo, piso y estado de habilitación. | `id_sala` identifica cada sala. |
| `reservas` | Registra titular, sala, fecha, bloque, cantidad de asistentes, propósito y estado. | `id_sala` se relaciona con `salas.id_sala`. La combinación sala, fecha y bloque debe ser única para impedir reservas simultáneas. |
| `historial_penalizaciones` | Conserva ausencias acumuladas y, si corresponde, la fecha hasta la que una persona permanece bloqueada. | Se identifica al usuario mediante su RUT. |
| `bitacora_administrativa` | Registra acciones administrativas realizadas al asistir a un estudiante. | Guarda el RUT del encargado y el RUT del estudiante afectado. |

La separación entre proyectos evita que las operaciones de reserva dependan de que ambas áreas compartan una misma base. Por esa razón, las referencias a personas entre DB-Institucional y DB-Reservas se realizan mediante el RUT, en vez de una clave foránea entre bases distintas. La aplicación valida el RUT contra el padrón institucional antes de permitir su uso en una reserva.

### X.2.3 Integridad y protección de datos

Las tablas relacionales permiten expresar reglas de integridad junto a los datos: identificadores únicos, límites de aforo, rangos de piso y bloque horario, estados válidos y relaciones sala-reserva. La restricción única para sala, fecha y bloque ayuda a controlar concurrencia desde la base de datos, incluso si dos solicitudes intentan reservar el mismo espacio al mismo tiempo.

Row Level Security (RLS) se utiliza para controlar qué filas puede consultar o modificar cada rol de la API. Las claves públicas (`anon` o `publishable`) deben operar sujetas a esas políticas. Las claves secretas o `service_role` omiten RLS, por lo que se reservan para código del servidor y nunca deben incluirse en el cliente ni en variables `NEXT_PUBLIC_`. [3] En este sistema, **no existe un cliente Supabase en el navegador**: la interfaz consume rutas API de Next.js y son esas rutas las que consultan ambos proyectos con claves secretas. Por lo tanto, la aplicación no requiere una publishable key y el acceso directo del navegador a PostgreSQL/Supabase queda cerrado. RLS se mantiene como defensa en profundidad para cualquier clave pública que se cree en el futuro; los scripts están en `docs/sql/`.

La consulta institucional privilegiada requiere configurar `SUPABASE_INSTITUCIONAL_SERVICE_ROLE_KEY` como variable privada del entorno. Del mismo modo, las operaciones privilegiadas sobre DB-Reservas usan `SUPABASE_RESERVAS_SERVICE_ROLE_KEY` solo en el servidor. La sesión del usuario se transporta en una cookie `inacap_session` firmada con HMAC-SHA256, con atributos `HttpOnly`, `Secure` (en producción) y `SameSite=Lax`; el rol y el RUT se leen de ese token firmado, nunca de cookies editables por el cliente.

## X.3 Estructura y recorrido de red

La arquitectura de despliegue es de tipo web cliente-servidor. El navegador presenta la interfaz; Next.js entrega las páginas y expone rutas de API; estas rutas y los módulos de acceso de datos se comunican con los proyectos Supabase mediante HTTPS y la API REST. Supabase procesa las solicitudes en su plataforma y las dirige a la base PostgreSQL correspondiente. La API REST de Supabase puede utilizarse desde el navegador o como complemento de una API propia; este proyecto opta por centralizar todo el acceso en rutas de servidor para no exponer claves públicas ni datos personales al cliente. [2]

```mermaid
flowchart LR
    U[Usuario]
    B[Navegador web<br/>Interfaz React]
    N[Aplicación Next.js<br/>Páginas y rutas API]
    I[Supabase DB-Institucional<br/>PostgreSQL: usuarios_institucion]
    R[Supabase DB-Reservas<br/>PostgreSQL: salas, reservas,<br/>penalizaciones y bitácora]

    U --> B
    B <-->|HTTPS + cookie de sesión firmada| N
    N <-->|HTTPS / API REST<br/>service_role (servidor)| I
    N <-->|HTTPS / API REST<br/>service_role (servidor)| R
```

El recorrido habitual de una operación es:

1. El usuario selecciona una acción en el navegador, por ejemplo, consultar salas o iniciar sesión.
2. La interfaz envía una solicitud HTTPS a una ruta de la aplicación Next.js. La cookie de sesión firmada viaja automáticamente.
3. El middleware y la ruta verifican la firma HMAC del token y aplican autorización por rol y por titularidad del recurso.
4. La ruta valida los datos recibidos y consulta el proyecto Supabase correspondiente mediante `supabase-js` con clave secreta.
5. Supabase aplica restricciones de PostgreSQL y devuelve los resultados a la ruta.
6. Next.js entrega la respuesta al navegador, que actualiza la interfaz.

Todas las consultas a Supabase se ejecutan en el servidor. El navegador no recibe claves secretas ni se conecta directamente a PostgreSQL: solo conoce la URL pública de la aplicación y la cookie de sesión. El uso de Supabase no significa que el navegador se conecte directamente al puerto de PostgreSQL; las comunicaciones de aplicación se realizan mediante HTTPS y la API de datos.

## X.4 Lenguajes y tecnologías seleccionados

| Lenguaje o tecnología | Uso en el sistema | Justificación |
| --- | --- | --- |
| **TypeScript** | Interfaz React, rutas API, controladores, modelos, validaciones y tipos de dominio. | Añade tipos estáticos a JavaScript y permite compartir contratos para usuarios, salas y reservas. Esto ayuda a detectar inconsistencias entre los datos enviados por la interfaz y los que espera el servidor. Next.js incorpora soporte para TypeScript y comprobación de tipos. [4] |
| **JavaScript** | Configuración de Next.js, Tailwind CSS y PostCSS, además de las herramientas de ejecución del proyecto. | Es el formato compatible con el ecosistema Node.js y con las herramientas de configuración utilizadas. El código de negocio se escribe principalmente en TypeScript. |
| **SQL** | Definición y administración del esquema PostgreSQL, claves, restricciones, índices y políticas RLS. | Es el lenguaje nativo para describir y consultar los datos relacionales, y permite imponer reglas de integridad en la base en lugar de depender solo de validaciones visuales. |
| **HTML y CSS** | Estructura semántica de las vistas y presentación visual, mediante JSX, CSS y utilidades de Tailwind. | Separan la estructura de la interfaz de su presentación y permiten adaptar las pantallas a distintos tamaños y necesidades de accesibilidad. React expresa la estructura de pantalla mediante JSX en componentes TypeScript. |

Next.js y React se seleccionaron como framework y biblioteca de interfaz, respectivamente; no son lenguajes de programación. Next.js organiza páginas y rutas API en una misma aplicación, mientras React permite construir la interfaz con componentes reutilizables. [4]

## X.5 Justificación de la selección tecnológica

La combinación de PostgreSQL, Supabase, Next.js y TypeScript responde a las necesidades del sistema de reservas:

- **Datos relacionados e integridad.** Salas, reservas, penalizaciones y acciones administrativas tienen relaciones y reglas que se expresan naturalmente en un modelo relacional. La base puede impedir duplicados de horario y estados o valores fuera de rango.
- **Separación del padrón y la operación.** Mantener usuarios y roles en DB-Institucional y las transacciones en DB-Reservas delimita responsabilidades y reduce la dependencia directa entre los dos conjuntos de datos. El costo de esa decisión es que las consultas cruzadas requieren validación desde la aplicación mediante identificadores institucionales, como el RUT.
- **Acceso por API segura.** La API REST de Supabase evita exponer conexiones directas de PostgreSQL al navegador. RLS permite controlar el acceso de las claves públicas; las credenciales privilegiadas permanecen en el servidor. [2] [3]
- **Desarrollo de interfaz y servidor en un mismo proyecto.** Next.js permite mantener las páginas y rutas de API dentro de una estructura común. TypeScript permite tipar ambas capas y el modelo de datos, lo que facilita corregir errores durante el desarrollo. [4]
- **Mantenimiento y extensibilidad.** La estructura modular del proyecto —páginas, rutas API, controladores, modelos, utilidades de sesión/autorización y tipos— permite agregar funcionalidades sin concentrar toda la lógica en una sola pantalla.

En conjunto, esta arquitectura entrega una base coherente para gestionar la disponibilidad de salas, prevenir conflictos de reserva y mostrar funciones según el rol institucional, manteniendo la información de identidad separada de los datos operacionales.

## Referencias

[1] Supabase, *Database Overview*. https://supabase.com/docs/guides/database/overview

[2] Supabase, *Data REST API*. https://supabase.com/docs/guides/api

[3] Supabase, *API Keys* y *Row Level Security*. https://supabase.com/docs/guides/getting-started/api-keys ; https://supabase.com/docs/guides/database/postgres/row-level-security

[4] Next.js, *App Router* y *TypeScript*. https://nextjs.org/docs/app ; https://nextjs.org/docs/app/api-reference/config/typescript
