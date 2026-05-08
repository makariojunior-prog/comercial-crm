/**
 * Script de importação de Clientes (Google Sheets CSV → Supabase)
 * Executar: node import_clients.cjs
 */
const https = require('https');

const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/15ygrVoRh7cd8iVWn0eBXpEz-jBVsOa4jxemmmva2rnA/export?format=csv&gid=1967327700';

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        return fetchCSV(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Falha ao baixar CSV: Status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(line => line.trim() !== '');
  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      let char = line[i];
      if (char === '"' && line[i+1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  });
}

async function run() {
  console.log('📥 Baixando dados da planilha...');
  const csvData = await fetchCSV(CSV_URL);
  
  if (csvData.trim().startsWith('<!DOCTYPE') || csvData.trim().startsWith('<html')) {
    console.error('❌ Erro: O link retornou HTML em vez de CSV. Verifique se a planilha está publicada como CSV para a Web.');
    console.log('Primeiros 200 caracteres:', csvData.trim().substring(0, 200));
    return;
  }

  const rows = parseCSV(csvData);
  console.log(`📊 Total de linhas de dados: ${rows.length}`);
  
  if (rows.length > 0) {
    console.log('🔍 Diagnóstico da primeira linha de dados:');
    rows[0].forEach((val, idx) => console.log(`  [${idx}] ${val}`));
  }

  const clientMap = new Map();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nome = r[4]; // NOME
    
    if (!nome) {
      continue;
    }

    const telefone = (r[17] || '').replace(/\D/g, ''); // TELEFONE
    const key = `${nome.toLowerCase().trim()}_${telefone}`;

    if (!clientMap.has(key)) {
      clientMap.set(key, {
        nome: nome.trim(),
        telefone: r[17] || null,
        setor: r[5] || null,    // SETOR
        empresa: r[11] || null, // EMPRESA
        origem: r[12] || null,  // ORIGEM
        atendente: r[13] || null, // ATENDENTE
        pedidos_count: parseInt(r[16]) || 0, // PEDIDOS
        observacao: r[18] || null, // OBSERVAÇÃO CLIENTE
        ativo: true
      });
    } else {
      const existing = clientMap.get(key);
      existing.pedidos_count += (parseInt(r[16]) || 0);
      if (!existing.setor && r[5]) existing.setor = r[5];
      if (!existing.atendente && r[13]) existing.atendente = r[13];
    }
  }

  const clients = Array.from(clientMap.values());
  console.log(`✅ Consolidados ${clients.length} clientes únicos.`);

  if (clients.length === 0) {
    console.log('⚠️ Nenhum cliente encontrado para importar.');
    return;
  }

  console.log('🚀 Enviando para o Supabase...');
  
  const batchSize = 50;
  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_clients?on_conflict=nome,telefone`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(batch)
    });

    if (res.ok) {
      console.log(`  ✓ ${Math.min(i + batchSize, clients.length)}/${clients.length}`);
    } else {
      const err = await res.text();
      console.error(`  ❌ Erro no lote ${i}:`, err);
    }
  }

  console.log('\n🎉 Importação de clientes concluída!');
}

run().catch(console.error);
