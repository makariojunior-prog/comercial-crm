/**
 * Script de importação: planilha Excel → Supabase
 * Tabelas: deals (REG-NEGOCIOS) e visits (VISITAS)
 * Executar: node import_data.cjs
 */

const XLSX = require('./node_modules/xlsx/xlsx.js');
const path = require('path');
const https = require('https');

// ── Configuração ──────────────────────────────────────────────
const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE';
const FILE_PATH = path.join('C:', 'Users', 'Makário Orozimbo', 'Downloads', 'Cantina_Lumar - Comercial.xlsx');

// ── Helpers ───────────────────────────────────────────────────
function excelDateToISO(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    // Tenta fazer parse de string de data (ex: "30/04/2026")
    const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return null;
  }
  if (typeof val === 'number' && val > 1000) {
    // Serial Excel → data JS (considera 1900 date bug do Excel)
    const ms = (val - 25569) * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }
  return null;
}

function cleanPhone(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === '0') return null;
  // Remove formatação e garante que seja string
  return s;
}

function cleanStatus(val, validValues, defaultVal = null) {
  if (!val) return defaultVal;
  const s = String(val).trim().toUpperCase();
  if (validValues.includes(s)) return s;
  // Tenta match parcial
  const found = validValues.find(v => s.includes(v) || v.includes(s));
  return found ?? defaultVal;
}

function cleanStr(val) {
  if (val === null || val === undefined || val === '') return null;
  return String(val).trim() || null;
}

// ── HTTP helper ───────────────────────────────────────────────
function supabaseRequest(method, table, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    if (method === 'GET') {
      url.searchParams.set('select', 'id');
      url.searchParams.set('limit', '1');
    }

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
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, status: res.statusCode });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw.substring(0, 200)}`));
        }
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
    const batch = rows.slice(i, i + batchSize);
    await supabaseRequest('POST', `${table}?on_conflict=id`, batch);
    inserted += batch.length;
    console.log(`  ✓ ${inserted}/${rows.length} linhas`);
  }
}

// ── Leitura da planilha ───────────────────────────────────────
console.log('📂 Abrindo planilha...');
const wb = XLSX.readFile(FILE_PATH);
console.log('Abas encontradas:', wb.SheetNames.join(', '));

// ═══════════════════════════════════════════════════════════════
// IMPORTAR NEGÓCIOS (REG-NEGOCIOS → deals)
// ═══════════════════════════════════════════════════════════════
const DEAL_STATUS = ['NOVO', 'EM ANDAMENTO', 'SUCESSO', 'DESISTIU', 'CANCELADO'];
const DEAL_PRIORITY = ['ALTA', 'MÉDIA', 'BAIXA'];

function importDeals() {
  console.log('\n📊 Lendo REG-NEGOCIOS...');
  const ws = wb.Sheets['REG-NEGOCIOS'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const deals = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const clientName = cleanStr(r[1]);
    if (!clientName) { skipped++; continue; }

    const status = cleanStatus(r[8], DEAL_STATUS);
    const priority = cleanStatus(r[9], DEAL_PRIORITY) || cleanStatus(r[9].toString(), ['ALTA','MÉDIA','MEDIA','BAIXA'].map(x => x), null);
    const prioMapped = (() => {
      const raw = String(r[9] || '').trim().toUpperCase();
      if (raw === 'ALTA') return 'ALTA';
      if (raw === 'MÉDIA' || raw === 'MEDIA') return 'MÉDIA';
      if (raw === 'BAIXA') return 'BAIXA';
      return null;
    })();

    const endDateRaw = r[11];
    const endDate = (() => {
      if (!endDateRaw) return null;
      const s = String(endDateRaw).trim();
      // Datas malformadas como "30/047/2026"
      if (s.includes('/')) {
        const m = s.match(/^(\d{1,2})\/(\d{1,4})\/(\d{4})$/);
        if (m && parseInt(m[2]) <= 31) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        return null;
      }
      return excelDateToISO(endDateRaw);
    })();

    deals.push({
      start_date: excelDateToISO(r[0]),
      client_name: clientName,
      contact_name: cleanStr(r[2]),
      contact_phone: cleanPhone(r[3]),
      deal_type: cleanStr(r[4]),
      responsible: cleanStr(r[5]),
      interest: cleanStr(r[6]),
      last_contact_date: excelDateToISO(r[7]),
      status: status,
      priority: prioMapped,
      follow_up: cleanStr(r[10]),
      end_date: endDate,
      potential_notes: cleanStr(r[12]),
    });
  }

  console.log(`  → ${deals.length} negócios prontos para importar (${skipped} linhas vazias ignoradas)`);
  console.log('  Exemplo:', JSON.stringify(deals[0], null, 2));
  return deals;
}

// ═══════════════════════════════════════════════════════════════
// IMPORTAR VISITAS (VISITAS → visits)
// ═══════════════════════════════════════════════════════════════
function importVisits() {
  console.log('\n📍 Lendo VISITAS...');

  const sheetName = wb.SheetNames.includes('VISITAS') ? 'VISITAS' : 'Dashboard-V';
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  console.log(`  → Usando aba: ${sheetName}, ${rows.length} linhas`);

  // Detectar linha de cabeçalho (procura por "DATA" ou "CLIENTE")
  let headerRow = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i];
    if (r.some(c => String(c).toUpperCase().includes('CLIENTE') || String(c).toUpperCase().includes('DATA'))) {
      headerRow = i;
      break;
    }
  }
  console.log(`  → Cabeçalho detectado na linha ${headerRow + 1}:`, JSON.stringify(rows[headerRow]));

  const header = rows[headerRow].map(h => String(h).trim().toUpperCase());
  const visits = [];
  let skipped = 0;

  // Para VISITAS: cols baseadas no script
  // COL_V = {DATA_VISITA: 1, TIPO: 2, CLIENTE: 3, CONTATO: 4, RESPONSAVEL: 5, STATUS: 6, DEMANDA: 7, RELATORIO: 8, PRIORIDADE: 12}
  // Para Dashboard-V: DATA(0), TIPO(1), CLIENTE(2), RESPONSÁVEL(3), DEMANDA(4), RELATÓRIO(5), PRIORIDADE(6), STATUS(7)

  const isVisitasAba = sheetName === 'VISITAS';

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.some(c => c !== '')) { skipped++; continue; }

    let visitDate, tipo, cliente, responsavel, demanda, relatorio, prioridade, status;

    if (isVisitasAba) {
      // Índices 0-based conforme o script
      visitDate = excelDateToISO(r[1]);
      tipo       = cleanStr(r[2]);
      cliente    = cleanStr(r[3]);
      responsavel= cleanStr(r[5]);
      status     = cleanStr(r[6]);
      demanda    = cleanStr(r[7]);
      relatorio  = cleanStr(r[8]);
      prioridade = cleanStr(r[12]);
    } else {
      // Dashboard-V
      visitDate  = excelDateToISO(r[0]);
      tipo       = cleanStr(r[1]);
      cliente    = cleanStr(r[2]);
      responsavel= cleanStr(r[3]);
      demanda    = cleanStr(r[4]);
      relatorio  = cleanStr(r[5]);
      prioridade = cleanStr(r[6]);
      status     = cleanStr(r[7]);
    }

    if (!cliente) { skipped++; continue; }

    visits.push({
      visit_date: visitDate,
      visit_type: tipo,
      client_name: cliente,
      responsible: responsavel,
      demand: demanda,
      report: relatorio,
      priority: prioridade,
      status: status || 'Realizada',
    });
  }

  console.log(`  → ${visits.length} visitas prontas para importar (${skipped} linhas vazias ignoradas)`);
  if (visits.length > 0) console.log('  Exemplo:', JSON.stringify(visits[0], null, 2));
  return visits;
}

// ═══════════════════════════════════════════════════════════════
// EXECUÇÃO
// ═══════════════════════════════════════════════════════════════
async function run() {
  try {
    const deals = importDeals();
    const visits = importVisits();

    console.log('\n🚀 Iniciando importação para o Supabase...');
    console.log(`   deals: ${deals.length} registros`);
    console.log(`   visits: ${visits.length} registros`);

    if (deals.length > 0) {
      console.log('\n📤 Importando negócios (deals)...');
      await upsertBatch('deals', deals, 20);
      console.log(`✅ ${deals.length} negócios importados!`);
    }

    if (visits.length > 0) {
      console.log('\n📤 Importando visitas (visits)...');
      await upsertBatch('visits', visits, 20);
      console.log(`✅ ${visits.length} visitas importadas!`);
    }

    console.log('\n🎉 Importação concluída com sucesso!');
  } catch (err) {
    console.error('\n❌ Erro durante importação:', err.message);
    process.exit(1);
  }
}

run();
