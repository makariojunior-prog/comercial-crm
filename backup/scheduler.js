'use strict';
const { spawnSync } = require('child_process');

function runBackup() {
  console.log('\n[' + new Date().toLocaleString('pt-BR') + '] Iniciando backup...');
  const r = spawnSync('node', ['/app/backup.js'], { stdio: 'inherit' });
  if (r.error) console.error('Erro ao executar backup:', r.error.message);
}

function msAte2h() {
  const agora = new Date();
  const prox  = new Date();
  prox.setHours(2, 0, 0, 0);
  if (prox <= agora) prox.setDate(prox.getDate() + 1);
  return prox - agora;
}

function agendarProximo() {
  const ms = msAte2h();
  const h  = Math.floor(ms / 3_600_000);
  const m  = Math.floor((ms % 3_600_000) / 60_000);
  console.log('[Scheduler] Próximo backup em ' + h + 'h ' + m + 'min (02:00 horário de Brasília)');
  setTimeout(() => { runBackup(); agendarProximo(); }, ms);
}

console.log('====================================================');
console.log(' CRM Backup Scheduler');
console.log(' Backup diário agendado para 02:00 (America/Sao_Paulo)');
console.log('====================================================');

console.log('[Scheduler] Executando backup inicial de verificação...');
runBackup();

agendarProximo();
