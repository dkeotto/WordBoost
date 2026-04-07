import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const mod = await import('./words.js?timestamp=' + Date.now());
  const wordsData = mod.default;

  const suspects = wordsData.filter(x => {
    const m = x.meaning.toLowerCase();
    return m.match(/(mış|miş|muş|müş|dı|di|du|dü|tı|ti|tu|tü|yor|acak|ecek|mal|mel)$/) || 
           m.length < 3 || 
           m.includes('  ') || 
           !m.match(/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s\(\)\.,'-]+$/);
  });

  const lines = suspects.map(x => `${x.term} -> ${x.meaning}`);
  fs.writeFileSync('suspects.txt', lines.join('\n'), 'utf8');
  console.log(`Wrote ${suspects.length} suspect words to suspects.txt`);
}

main().catch(console.error);
