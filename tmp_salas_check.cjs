const fs = require('fs');
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL = env.NEXT_PUBLIC_SUPABASE_RESERVAS_URL;
const KEY = env.SUPABASE_RESERVAS_SERVICE_ROLE_KEY;
(async () => {
  const r = await fetch(`${URL}/rest/v1/salas?select=*`, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'count=exact' },
  });
  console.log('status:', r.status, 'content-range:', r.headers.get('content-range'));
  const data = await r.json();
  console.log('filas:', Array.isArray(data) ? data.length : data);
  if (Array.isArray(data)) console.log(JSON.stringify(data.slice(0, 5), null, 2));
})();
