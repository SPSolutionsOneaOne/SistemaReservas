/* Genera una imagen SVG por caso con la salida real del test. */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'pruebas-ejecucion-90-casos');
const summary = JSON.parse(fs.readFileSync(path.join(OUT, 'summary.json'), 'utf8'));
const resultados = summary.resultados || [];

const escapeXml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colorFor = (status) => {
  switch (status) {
    case 'PASS': return '#166534';
    case 'INFO': return '#3730a3';
    case 'FAIL':
    case 'ERROR': return '#991b1b';
    case 'NO_EXEC': return '#475569';
    case 'NO_IMPL': return '#92400e';
    default: return '#334155';
  }
};

let hechas = 0;
for (const r of resultados) {
  const lineas = String(r.texto || '').replace(/\r\n/g, '\n').split('\n');
  const lineHeight = 22;
  const charWidth = 8.4;
  const paddingX = 32;
  const paddingY = 28;
  const headerH = 64;
  const maxChars = Math.max(1, ...lineas.map((l) => l.length), String(r.id).length + 20);
  const width = Math.min(2200, Math.ceil(maxChars * charWidth) + paddingX * 2);
  const height = headerH + paddingY + lineas.length * lineHeight + paddingY;

  const textoTspans = lineas
    .map((l, i) => `<text x="${paddingX}" y="${headerH + paddingY + (i + 0.4) * lineHeight}" class="line">${escapeXml(l) || ' '}</text>`)
    .join('\n  ');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0f172a"/>
  <rect width="${width}" height="${headerH}" fill="#1e40af"/>
  <text x="${paddingX}" y="28" class="title">${escapeXml(r.id)}</text>
  <text x="${paddingX}" y="48" class="status" fill="${colorFor(r.status)}">${escapeXml(r.status)}</text>
  <g>
  ${textoTspans}
  </g>
  <style>
    .title { font-family: 'Consolas','Courier New',monospace; font-size: 18px; fill:#fff; font-weight: bold; }
    .status { font-family: 'Consolas','Courier New',monospace; font-size: 14px; fill:#fff; font-weight: bold; }
    .line { font-family: 'Consolas','Courier New',monospace; font-size: 14px; fill: #e2e8f0; }
  </style>
</svg>`;

  fs.writeFileSync(path.join(OUT, `${r.id}.svg`), svg, 'utf8');
  hechas++;
}
console.log('SVGs generados:', hechas);
