/* Genera evidencia.html: informe visual de los 90 casos con su salida. */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'pruebas-ejecucion-90-casos');
const summary = JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8'));
const resultados = summary.resultados;

const ESTADO = {
  PASS: { label: '✅ Aprobado', cls: 'ok' },
  FAIL: { label: '❌ Fallido', cls: 'bad' },
  INFO: { label: 'ℹ️ Informativo', cls: 'info' },
  NO_EXEC: { label: '⏸ No ejecutado', cls: 'skip' },
  NO_IMPL: { label: '🚧 Pendiente', cls: 'warn' },
  ERROR: { label: '❌ Error', cls: 'bad' },
};

const filas = resultados.map((r) => {
  const e = ESTADO[r.status] || { label: r.status, cls: 'info' };
  return `
    <tr class="${e.cls}">
      <td class="id">${r.id}</td>
      <td class="st">${e.label}</td>
      <td><pre>${String(r.texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></td>
    </tr>`;
}).join('\n');

const total = resultados.length;
const conteos = resultados.reduce((a, r) => ((a[r.status] ? a[r.status] : (a[r.status] = 0)), a), {});
const resumen = Object.entries(conteos).map(([k, v]) => `<span class="badge ${k.toLowerCase()}">${k}: ${v}</span>`).join('');

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Evidencia de ejecución — Plan de pruebas ISO 29119-3</title>
<style>
  body { font-family: 'IBM Plex Sans', system-ui, sans-serif; margin: 0; background: #f4f6f8; color: #0f172a; }
  header { background: #1e40af; color: #fff; padding: 18px 28px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  header small { color: #bfd1ff; }
  .resumen { position: sticky; top: 0; background: #fff; padding: 10px 28px; border-bottom: 1px solid #e2e8f0; }
  .badge { display: inline-block; margin: 3px 6px 3px 0; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge.pass { background: #dcfce7; color: #166534; } .badge.info { background: #e0e7ff; color: #3730a3; }
  .badge.fail { background: #fee2e2; color: #991b1b; } .badge.no_exec { background: #f1f5f9; color: #475569; }
  .badge.no_impl { background: #fef3c7; color: #92400e; } .badge.error { background: #fee2e2; color: #991b1b; }
  table { width: 100%; border-collapse: collapse; background: #fff; font-size: 12.5px; }
  th { text-align: left; background: #0f172a; color: #fff; padding: 8px 10px; position: sticky; top: 52px; }
  td { vertical-align: top; border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
  .id { font-weight: 700; white-space: nowrap; color: #1e293b; width: 130px; }
  .st { white-space: nowrap; width: 130px; font-weight: 700; }
  tr.ok td.st { color: #166534; } tr.bad td.st { color: #991b1b; } tr.info td.st { color: #3730a3; }
  tr.skip td.st, tr.warn td.st { color: #475569; }
  pre { margin: 0; white-space: pre-wrap; font-size: 11.5px; line-height: 1.45; font-family: 'Consolas', monospace; color: #334155; }
  footer { text-align: center; color: #94a3b8; font-size: 11px; padding: 14px; }
</style>
</head>
<body>
<header>
  <h1>Evidencia de ejecución — Plan de Pruebas 90 casos</h1>
  <small>ISO/IEC/IEEE 29119-3 · GitHub/Ejecución local · ${escapeHtml(String(summary.ts || ''))}</small>
</header>
<div class="resumen">
  <strong>${total} casos.</strong> ${resumen}
</div>
<main>
<table>
  <thead><tr><th>ID Caso</th><th>Estado</th><th>Salida</th></tr></thead>
  <tbody>${filas}</tbody>
</table>
</main>
<footer>Generado desde scripts/90/build_evidencia.cjs</footer>
</body>
</html>
`;

function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
fs.writeFileSync(path.join(OUT, 'evidencia.html'), html, 'utf8');
console.log('evidencia.html generado en', path.join(OUT, 'evidencia.html'));
