/**
 * Importa produtos da aba TABELAS → crm_price_items
 * Executar: node import_prices.cjs
 */
const XLSX  = require('./node_modules/xlsx/xlsx.js');
const path  = require('path');
const https = require('https');

const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE';
const FILE_PATH = path.join('C:', 'Users', 'Makário Orozimbo', 'Downloads', 'Cantina_Lumar - Comercial.xlsx');

function toBool(val) {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toUpperCase() === 'VERDADEIRO' || val === '1' || val.toUpperCase() === 'TRUE';
  return Boolean(val);
}
function toNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}
function cleanStr(val) {
  const s = String(val ?? '').trim();
  return s || null;
}

function supabaseRequest(method, table, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
    };
    const req = https.request(url.toString(), options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ ok: true });
        else reject(new Error(`HTTP ${res.statusCode}: ${raw.substring(0, 300)}`));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function upsertBatch(table, rows, batchSize = 50) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    await supabaseRequest('POST', `${table}?on_conflict=id`, rows.slice(i, i + batchSize));
    inserted += Math.min(batchSize, rows.length - i);
    console.log(`  ✓ ${inserted}/${rows.length}`);
  }
}

async function run() {
  console.log('📂 Lendo planilha...');
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets['TABELAS'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const items = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const empresa = cleanStr(r[0]);
    const nome    = cleanStr(r[2]);
    if (!empresa || !nome) { skipped++; continue; }
    if (empresa !== 'lumar' && empresa !== 'cantina') { skipped++; continue; }

    items.push({
      empresa,
      nome,
      custo:         toNum(r[3]),
      preco_lumar:   toNum(r[4]),
      preco_varejo:  toNum(r[5]),
      preco_revenda: toNum(r[6]),
      pf:    toBool(r[7]),
      ativo: toBool(r[8]),
    });
  }

  console.log(`  → ${items.length} produtos (${skipped} ignorados)`);
  console.log('  Lumar:   ', items.filter(x => x.empresa === 'lumar').length);
  console.log('  Cantina: ', items.filter(x => x.empresa === 'cantina').length);
  console.log('  Exemplo:', JSON.stringify(items[0], null, 2));

  console.log('\n🚀 Importando para crm_price_items...');
  await upsertBatch('crm_price_items', items, 30);
  console.log(`\n✅ ${items.length} produtos importados!`);
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
