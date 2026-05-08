/**
 * Script de importação de Clientes (Nova Planilha - Consolidação de Campos)
 * Executar: node import_clients.cjs
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE';
const FILE_PATH = path.join('C:', 'Users', 'Makário Orozimbo', 'Downloads', 'Cantina_Lumar - Comercial - CLIENTES LUMAR.csv');

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

function standardizeName(name) {
  if (!name) return '';
  return name.trim().toUpperCase()
    .replace(/\s+/g, ' '); // Remove espaços extras
}

async function run() {
  console.log('📥 Lendo arquivo CSV local...');
  const csvData = fs.readFileSync(FILE_PATH, 'utf8');
  const rows = parseCSV(csvData);
  console.log(`📊 Total de linhas de dados: ${rows.length}`);

  const clients = rows.map(r => {
    const nome = standardizeName(r[1]); // CLIENTE
    if (!nome) return null;

    return {
      nome: nome,
      cnpj_cpf: r[2] || null,
      telefone: r[3] || null,
      rota: r[4] || null,
      setor: r[5] || null,
      pgto: r[6] || null,
      localizacao: r[7] || null,
      observacoes: r[8] || null,
      dia_entrega: r[9] || null,
      mensagem: r[10] || null,
      bonificacao: r[11] || null,
      restricao: r[12] || null,
      tipo: r[13] || null,
      carteira: r[15] || null, // Index 15 pq TIPO aparece 2x no header (13 e 14)
      manutencao: r[16] || null,
      frequencia: r[17] || null,
      comodato: r[18] || null,
      valor: r[19] || null,
      data_planilha: r[20] || null,
      observacao_extra: r[21] || null,
      status: (r[16] || '').toUpperCase() === 'INATIVO' ? 'PERDIDO' : 'ATIVO',
      pedidos_count: 0
    };
  }).filter(c => c !== null);

  console.log(`✅ Preparados ${clients.length} clientes para importação.`);

  console.log('🧹 Limpando tabela crm_clients antes da importação...');
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_clients?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    }
  });

  if (!delRes.ok) {
    console.error('❌ Erro ao limpar tabela:', await delRes.text());
    return;
  }
  console.log('✨ Tabela limpa.');

  console.log('🚀 Enviando novos dados para o Supabase...');
  
  const batchSize = 50;
  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_clients`, {
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

  console.log('\n🎉 Importação de clientes concluída com sucesso!');
}

run().catch(console.error);
