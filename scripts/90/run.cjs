/* Runner principal de los 90 casos. Genera salidas por caso en una carpeta.
   Uso: node scripts/90/run.cjs */
const fs = require('fs');
const path = require('path');

const fase1 = require('./fase1.cjs');
const fase2 = require('./fase2.cjs');
const fase3 = require('./fase3.cjs');
const fase4 = require('./fase4.cjs');

const OUT = 'pruebas-ejecucion-90-casos';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const resultados = [];
  const t0 = Date.now();
  for (const [nombre, fn] of [['FASE 1', fase1], ['FASE 2', fase2], ['FASE 3', fase3], ['FASE 4', fase4]]) {
    console.log(`\n===== ${nombre} =====`);
    try {
      const salida = await fn();
      for (const item of salida) {
        resultados.push(item);
        console.log(`  [${item.status.padEnd(7)}] ${item.id}`);
      }
    } catch (err) {
      console.error(`ERROR en ${nombre}:`, err.message);
      resultados.push({ id: `${nombre}-ERROR`, status: 'ERROR', texto: err.message });
    }
  }

  // Escritura de archivos por caso
  const ts = new Date().toISOString();
  const comandos = [
    '# Comandos de ejecución — Plan de pruebas 90 casos',
    '',
    `Generado: ${ts}`,
    '',
    '## Entorno',
    '',
    '- App en producción: https://sistema-reservas-lac.vercel.app',
    '- Despliegue: `npx vercel --prod --yes` desde la rama master (GitHub → Vercel)',
    '- Runner: `node scripts/90/run.cjs`',
    '- Evidencia por caso: `pruebas-ejecucion-90-casos/<CP-XXX>.txt` y `.png`',
    '- Credenciales usadas son cuentas de prueba efímeras (se crean y eliminan en cada fase).',
    '',
    '## Dependencias usadas',
    '',
    '- `node` (HTTPS nativo vía fetch global)',
    '- `@supabase/supabase-js` (vía PostgREST REST sin SDK)',
    '- `argon2` (hashes/verificación local)',
    '- `node:crypto` (HMAC, firmas locales en CP-FA1-010 / CP-FA1-017)',
    '- Variables de entorno de `.env.local`: URLs de Supabase, service_role keys, SESSION_SECRET',
    '',
    '## Comandos exactos',
    '',
    '```bash',
    '# Build y despliegue (deploy ya hecho)',
    'npm run build',
    'npx vercel --prod --yes',
    '',
    '# Motor de penalización (cron externo cada 10 min en cron-job.org)',
    'curl -H "Authorization: Bearer $CRON_SECRET" https://sistema-reservas-lac.vercel.app/api/cron/ausencias',
    '',
    '# Limpieza rate limiting (cron externo diario)',
    'curl -H "Authorization: Bearer $CRON_SECRET" https://sistema-reservas-lac.vercel.app/api/cron/limpieza',
    '',
    '# Runner de los 90 casos',
    'node scripts/90/run.cjs',
    '```',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'comandos.md'), comandos);

  for (const item of resultados) {
    const contenido = [
      `Caso: ${item.id}`,
      `Fecha: ${ts}`,
      `Resultado: ${item.status}`,
      '',
      'Detalle:',
      item.texto,
      '',
    ].join('\n');
    fs.writeFileSync(path.join(OUT, `${item.id}.txt`), contenido);
  }

  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ ts, total: resultados.length, resultados }, null, 2));

  const por = resultados.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
  console.log('\n===== RESUMEN =====');
  console.log('Total casos:', resultados.length);
  console.log('Por estado:', JSON.stringify(por));
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('Duración:', dt + 's');
  console.log('Salidas en', OUT + '/');
})();
