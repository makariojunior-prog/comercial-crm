const https = require('https');

const SUPABASE_URL = 'https://taicaxtjtikdajmhtsxc.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não está configurada');
  console.error('Execute: set SUPABASE_SERVICE_ROLE_KEY=sua-chave-aqui');
  process.exit(1);
}

async function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.request(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        ...options.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject).end(options.body ? JSON.stringify(options.body) : undefined);
  });
}

async function main() {
  console.log('🔍 Verificando conversas pendentes...\n');

  // Buscar conversas pendentes
  console.log('⏳ Processando conversas com status_ia = pending...');
  const pendingResult = await fetchJSON(`${SUPABASE_URL}/rest/v1/crm_conversations?select=id&status_ia=eq.pending&limit=1&count=exact`, {
    method: 'GET',
    headers: { 'Range': 'items=0-0' },
  });

  const pendingCount = pendingResult['Content-Range']?.split('/')[1] || 0;

  // Buscar conversas com erro
  console.log('⏳ Processando conversas com status_ia = error...');
  const errorResult = await fetchJSON(`${SUPABASE_URL}/rest/v1/crm_conversations?select=id&status_ia=eq.error&limit=1&count=exact`, {
    method: 'GET',
    headers: { 'Range': 'items=0-0' },
  });

  const errorCount = errorResult['Content-Range']?.split('/')[1] || 0;

  console.log(`\n📊 Status atual:`);
  console.log(`   • Pendentes: ${pendingCount}`);
  console.log(`   • Com erro: ${errorCount}`);
  console.log(`   • Total a processar: ${pendingCount + errorCount}\n`);

  if (!pendingCount && !errorCount) {
    console.log('✅ Nenhuma conversa para processar!');
    process.exit(0);
  }

  // Chamar process-conversations
  if (pendingCount) {
    console.log('⏳ Chamando process-conversations para pendentes...');
    try {
      const result = await fetchJSON(`${SUPABASE_URL}/functions/v1/process-conversations`, {
        method: 'POST',
      });
      console.log(`   ✓ Processadas: ${result.ok}/${result.total}`);
      if (result.failed) console.log(`   ✗ Falhadas: ${result.failed}`);
      if (result.errors?.length) {
        console.log(`   Erros (primeiros 3):`);
        result.errors.slice(0, 3).forEach(e => {
          console.log(`      • ${e.id.slice(0, 8)}: ${e.error.slice(0, 60)}`);
        });
      }
    } catch (e) {
      console.error(`   ❌ Erro:`, e.message);
    }
    console.log();
  }

  // Chamar reprocess-conversations
  if (errorCount) {
    console.log('🔄 Chamando reprocess-conversations para erros...');
    try {
      const result = await fetchJSON(`${SUPABASE_URL}/functions/v1/reprocess-conversations`, {
        method: 'POST',
      });
      console.log(`   ✓ Reprocessadas: ${result.ok}/${result.total}`);
      if (result.failed) console.log(`   ✗ Falhadas: ${result.failed}`);
    } catch (e) {
      console.error(`   ❌ Erro:`, e.message);
    }
    console.log();
  }

  console.log('✅ Processamento concluído!');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
