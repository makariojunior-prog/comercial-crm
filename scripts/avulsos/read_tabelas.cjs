const XLSX = require('./node_modules/xlsx/xlsx.js');
const path = require('path');

const filePath = path.join('C:', 'Users', 'Makário Orozimbo', 'Downloads', 'Cantina_Lumar - Comercial.xlsx');
const wb = XLSX.readFile(filePath);

const ws = wb.Sheets['TABELAS'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

console.log('=== TABELAS — primeiras 80 linhas ===');
rows.slice(0, 80).forEach((r, i) => {
  if (r.some(c => c !== '')) console.log(`L${i + 1}:`, JSON.stringify(r));
});
console.log('\nTotal linhas:', rows.length);

// Mostra também como JSON com headers para entender estrutura
console.log('\n=== Como JSON (primeiros 5 registros com cabeçalho) ===');
const asJson = XLSX.utils.sheet_to_json(ws, { defval: '' });
asJson.slice(0, 5).forEach((r, i) => console.log(`[${i}]`, JSON.stringify(r)));
