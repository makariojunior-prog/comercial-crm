'use strict';
const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ─── CONFIGURAÇÃO ────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://SEU_PROJETO.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'SUA_ANON_KEY';
// Pasta de destino: caminho local ou drive mapeado do NAS (ex: Z:\CRM-Backup)
const BACKUP_DIR   = process.env.BACKUP_DIR   || path.join(__dirname, 'dados');
// Quantos dias de histórico manter (mais antigos são removidos)
const MANTER_DIAS  = parseInt(process.env.MANTER_DIAS || '60');
// ─────────────────────────────────────────────────────────────────────────────

// nome: tabela no Supabase
// order: coluna usada para ordenar (garantir ordem determinística no JSON)
// limit: máximo de registros
const TABELAS = [
  // Negócios / visitas (tabelas legadas sem prefixo)
  { nome: 'deals',               order: 'id',         limit: 10000 },
  { nome: 'visits',              order: 'id',         limit: 10000 },

  // Clientes
  { nome: 'crm_clients',         order: 'nome',       limit: 10000 },

  // Eventos / promotoria
  { nome: 'crm_events',          order: 'event_date', limit: 10000 },
  { nome: 'crm_event_materials', order: 'id',         limit: 10000 },
  { nome: 'crm_event_staff',     order: 'id',         limit: 10000 },

  // Tarefas
  { nome: 'crm_tasks',           order: 'id',         limit: 10000 },
  { nome: 'crm_task_assignees',  order: 'id',         limit: 10000 },

  // Equipe / perfis
  { nome: 'crm_staff',           order: 'id',         limit: 10000 },
  { nome: 'crm_roles',           order: 'id',         limit: 10000 },
  { nome: 'crm_users',           order: 'id',         limit: 10000 },

  // IA / histórico / preços
  { nome: 'crm_briefings',       order: 'id',         limit: 10000 },
  { nome: 'crm_deal_history',    order: 'id',         limit: 50000 },
  { nome: 'crm_price_items',     order: 'id',         limit: 10000 },
];

function fetchTable({ nome: tabela, order = 'id', limit = 10000 }) {
  return new Promise((resolve, reject) => {
    const host    = SUPABASE_URL.replace('https://', '');
    // Sem filtro empresa_id — CRM usa estrutura flat com RLS por usuário
    const query   = `limit=${limit}&order=${order}`;
    const options = {
      hostname: host,
      path: `/rest/v1/${tabela}?select=*&${query}`,
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept':        'application/json',
      },
    };
    https.get(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(raw)); }
          catch (e) { reject(new Error(`Parse error em ${tabela}: ${raw.slice(0, 300)}`)); }
        } else {
          reject(new Error(`HTTP ${res.statusCode} em ${tabela}: ${raw.slice(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

function rmDir(dir) {
  if (fs.rmSync) {
    fs.rmSync(dir, { recursive: true, force: true });
  } else {
    const entries = fs.readdirSync(dir);
    for (const e of entries) {
      const p = path.join(dir, e);
      if (fs.lstatSync(p).isDirectory()) rmDir(p);
      else fs.unlinkSync(p);
    }
    fs.rmdirSync(dir);
  }
}

async function main() {
  const now     = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
  const destDir = path.join(BACKUP_DIR, dateStr);

  fs.mkdirSync(destDir, { recursive: true });

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  CRM Backup  —  ${dateStr} ${timeStr}  ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`   Destino : ${destDir}\n`);

  const resumo   = { data: dateStr, hora: timeStr, tabelas: {}, erro: null };
  const completo = {};
  let totalRecs  = 0;

  for (const tbl of TABELAS) {
    const { nome } = tbl;
    try {
      const dados   = await fetchTable(tbl);
      const arquivo = path.join(destDir, `${nome}.json`);
      fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
      resumo.tabelas[nome] = dados.length;
      completo[nome]       = dados;
      totalRecs           += dados.length;
      console.log(`  ✓  ${nome.padEnd(26)} ${String(dados.length).padStart(5)} registros`);
    } catch (e) {
      resumo.tabelas[nome] = `ERRO: ${e.message}`;
      console.error(`  ✗  ${nome.padEnd(26)} ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(destDir, '_backup_completo.json'), JSON.stringify(completo, null, 2), 'utf8');
  fs.writeFileSync(path.join(destDir, '_resumo.json'),          JSON.stringify(resumo, null, 2),   'utf8');

  console.log(`\n  Total: ${totalRecs} registros em ${TABELAS.length} tabelas`);

  if (resumo.erro === null && Object.values(resumo.tabelas).some(v => String(v).startsWith('ERRO'))) {
    resumo.erro = 'Uma ou mais tabelas falharam — verifique _resumo.json';
  }

  // ── Rotação: remover backups mais antigos que MANTER_DIAS ──────────────────
  const pastasDia = fs.readdirSync(BACKUP_DIR)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  if (pastasDia.length > MANTER_DIAS) {
    const aRemover = pastasDia.slice(0, pastasDia.length - MANTER_DIAS);
    console.log(`\n  Removendo ${aRemover.length} backup(s) antigo(s):`);
    for (const d of aRemover) {
      try {
        rmDir(path.join(BACKUP_DIR, d));
        console.log(`    🗑  ${d}`);
      } catch (e) {
        console.error(`    ✗  Falha ao remover ${d}: ${e.message}`);
      }
    }
  }

  console.log(`\n✅ Backup concluído com sucesso!\n`);
}

main().catch(e => {
  console.error('\n❌ ERRO FATAL:', e.message);
  process.exit(1);
});
