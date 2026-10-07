/**
 * Importação de Clientes — lê CLIENTES.xlsx e upsert em crm_clients
 * Executar: node import_clients.cjs
 */
const XLSX  = require('xlsx');
const path  = require('path');

const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhaWNheHRqdGlrZGFqbWh0c3hjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjgwNzcsImV4cCI6MjA5MzAwNDA3N30.G923g-1cmjrQZi7EoOcZcP1PieO9AKmk4mMMUgT4hbE';
const FILE_PATH = path.join('C:', 'Users', 'Makário Orozimbo', 'Downloads', 'CLIENTES.xlsx');

// Formata número de telefone: garante string com 10-11 dígitos
function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 8) return null;
  // Remove country code 55 se vier na frente com mais de 11 dígitos
  const clean = digits.length > 11 ? digits.slice(-11) : digits;
  if (clean.length === 11) return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0,2)}) ${clean.slice(2,6)}-${clean.slice(6)}`;
  return clean;
}

// Formata CPF/CNPJ numérico
function formatDoc(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '').replace(/\.0$/, '');
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}

// Converte serial date do Excel para string ISO
function excelDateToISO(serial) {
  if (!serial) return null;
  if (typeof serial === 'string') {
    // já é string de data (ex: "11/23/2023")
    const d = new Date(serial);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof serial === 'number') {
    const d = XLSX.SSF.parse_date_code(serial);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  return null;
}

// Status: INATIVO na manutenção → PERDIDO; caso contrário ATIVO
function deriveStatus(manutencao) {
  return String(manutencao || '').trim().toUpperCase() === 'INATIVO' ? 'PERDIDO' : 'ATIVO';
}

async function run() {
  console.log('📥 Lendo planilha CLIENTES.xlsx...');
  const wb = XLSX.readFile(FILE_PATH);
  const ws = wb.Sheets['CLIENTES'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  console.log(`📊 Total de linhas: ${rows.length}`);

  const clients = rows
    .map(r => {
      const nome = String(r['CLIENTE'] || '').trim().toUpperCase().replace(/\s+/g, ' ');
      if (!nome) return null;

      const tipo1 = String(r['TIPO'] || '').trim();
      const tipo2 = String(r['TIPO_1'] || '').trim();
      const tipo  = tipo2 ? `${tipo1} / ${tipo2}` : tipo1 || null;

      const manutencao = String(r['MANUTENÇÃO'] || '').trim() || null;

      return {
        nome,
        cnpj_cpf:       formatDoc(r['CNPJCPF']),
        telefone:       formatPhone(r['TELEFONE']),
        rota:           String(r['ROTA'] || '').trim() || null,
        setor:          String(r['SETOR'] || '').trim() || null,
        pgto:           String(r['PGTO'] || '').trim() || null,
        localizacao:    r['LOCALIZAÇÃO'] ? String(r['LOCALIZAÇÃO']).trim() : null,
        observacoes:    r['OBSERVAÇÕES'] ? String(r['OBSERVAÇÕES']).trim() : null,
        dia_entrega:    r['DIA DA ENTREGA'] ? String(r['DIA DA ENTREGA']).trim() : null,
        mensagem:       String(r['MENSAGEM'] || 'NÃO').trim().toUpperCase(),
        restricao:      r['RESTRIÇÃO'] ? String(r['RESTRIÇÃO']).trim() : null,
        tipo,
        carteira:       String(r['CARTEIRA'] || '').trim() || null,
        manutencao,
        frequencia:     String(r['FREQUÊNCIA'] || '').trim() || null,
        comodato:       r['COMODATO'] ? String(r['COMODATO']).trim() : null,
        valor:          r['VALOR'] ? String(r['VALOR']).trim() : null,
        data_planilha:  excelDateToISO(r['DATA']),
        status:         deriveStatus(manutencao),
        pedidos_count:  0,
      };
    })
    .filter(Boolean);

  console.log(`✅ ${clients.length} clientes prontos para importação`);

  // Estatísticas rápidas
  const porTipo      = {};
  const porCarteira  = {};
  const porStatus    = {};
  clients.forEach(c => {
    porTipo[c.tipo || '(sem tipo)']          = (porTipo[c.tipo || '(sem tipo)'] || 0) + 1;
    porCarteira[c.carteira || '(sem cart.)'] = (porCarteira[c.carteira || '(sem cart.)'] || 0) + 1;
    porStatus[c.status]                      = (porStatus[c.status] || 0) + 1;
  });
  console.log('  Por tipo:', porTipo);
  console.log('  Por carteira:', porCarteira);
  console.log('  Por status:', porStatus);

  console.log('\n🧹 Limpando tabela crm_clients...');
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_clients?id=not.is.null`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
  });
  if (!delRes.ok) {
    console.error('❌ Erro ao limpar:', await delRes.text());
    return;
  }
  console.log('✨ Tabela limpa.');

  console.log('🚀 Enviando dados...');
  const batchSize = 50;
  for (let i = 0; i < clients.length; i += batchSize) {
    const batch = clients.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/crm_clients`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(batch),
    });

    if (res.ok) {
      console.log(`  ✓ ${Math.min(i + batchSize, clients.length)}/${clients.length}`);
    } else {
      const err = await res.text();
      console.error(`  ❌ Lote ${i}:`, err);
    }
  }

  console.log('\n🎉 Importação concluída!');
}

run().catch(console.error);
