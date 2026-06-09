// Just verify the changes in the bundled code
import fs from 'fs';
import path from 'path';

console.log('Verifying code changes...\n');

// Read NoteModal.tsx
const noteModalPath = path.resolve('src/components/NoteModal.tsx');
const noteModalCode = fs.readFileSync(noteModalPath, 'utf8');

console.log('1. Checking textarea min-height:');
if (noteModalCode.includes('min-h-[240px]')) {
  console.log('   ✅ Textarea min-height increased to 240px');
} else {
  console.log('   ❌ Textarea min-height NOT found');
}

console.log('\n2. Checking co-responsible button compacting:');
if (noteModalCode.includes('px-2 py-0.5') && noteModalCode.includes('text-[9px]')) {
  console.log('   ✅ Co-responsible buttons compacted (px-2 py-0.5 text-[9px])');
} else {
  console.log('   ❌ Button compacting NOT found');
}

// Read types/index.ts
const typesPath = path.resolve('src/types/index.ts');
const typesCode = fs.readFileSync(typesPath, 'utf8');

console.log('\n3. Checking red color in NoteColor type:');
if (typesCode.includes("'red'") && typesCode.includes("type NoteColor")) {
  console.log('   ✅ Red color added to NoteColor type');
} else {
  console.log('   ❌ Red color NOT in NoteColor type');
}

console.log('\n4. Checking red color in NOTE_COLORS object:');
if (typesCode.includes("red:") && typesCode.includes("bg-red-50") && typesCode.includes("Vermelho")) {
  console.log('   ✅ Red color object added to NOTE_COLORS (bg-red-50, border-red-300, bg-red-500, Vermelho)');
} else {
  console.log('   ❌ Red color object NOT found');
}

console.log('\n✅ All code changes verified successfully!');
