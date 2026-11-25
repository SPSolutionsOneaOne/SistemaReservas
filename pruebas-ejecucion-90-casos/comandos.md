# Comandos de ejecución — Plan de pruebas 90 casos

Generado: 2026-11-25T23:56:04.962Z

## Entorno

- App en producción: https://sistema-reservas-lac.vercel.app
- Despliegue: `npx vercel --prod --yes` desde la rama master (GitHub → Vercel)
- Runner: `node scripts/90/run.cjs`
- Evidencia por caso: `pruebas-ejecucion-90-casos/<CP-XXX>.txt` y `.png`
- Credenciales usadas son cuentas de prueba efímeras (se crean y eliminan en cada fase).

## Dependencias usadas

- `node` (HTTPS nativo vía fetch global)
- `@supabase/supabase-js` (vía PostgREST REST sin SDK)
- `argon2` (hashes/verificación local)
- `node:crypto` (JWT HS256, firmas locales en CP-FA1-010 / CP-FA1-017)
- Variables de entorno de `.env.local`: URLs de Supabase, service_role keys, SESSION_SECRET

## Comandos exactos

```bash
# Build y despliegue (deploy ya hecho)
npm run build
npx vercel --prod --yes

# Motor de penalización (cron externo cada 10 min en cron-job.org)
curl -H "Authorization: Bearer $CRON_SECRET" https://sistema-reservas-lac.vercel.app/api/cron/ausencias

# Limpieza rate limiting (cron externo diario)
curl -H "Authorization: Bearer $CRON_SECRET" https://sistema-reservas-lac.vercel.app/api/cron/limpieza

# Runner de los 90 casos
node scripts/90/run.cjs
```