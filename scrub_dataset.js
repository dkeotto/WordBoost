const fs = require('fs');
const wordsData = require('./words').default;

const scrubbed = wordsData.map(word => {
  let meaning = word.meaning;
  let term = word.term.toLowerCase();

  // 1. Specific Fixes (Truncation/Errors)
  if (term === 'jellyfish' && meaning === 'anası') meaning = 'Deniz anası';
  if (term === 'brought' && meaning === 'getirmişsin') meaning = 'Getirmek';
  if (term === 'bring' && meaning === 'getirmişsin') meaning = 'Getirmek';

  // 2. Verb Normalization (Turkish suffixes)
  // Fix conjugated endings to infinitives
  const verbEnds = [
    { from: 'mişsin', to: 'mek' },
    { from: 'mişler', to: 'mek' },
    { from: 'mışlar', to: 'mak' },
    { from: 'ıyor', to: 'mak' },
    { from: 'iyor', to: 'mek' },
    { from: 'uyor', to: 'mak' },
    { from: 'üyor', to: 'mek' },
    { from: 'muşlar', to: 'mak' },
    { from: 'müşler', to: 'mek' },
    { from: 'acaklar', to: 'mak' },
    { from: 'ecekler', to: 'mek' }
  ];

  verbEnds.forEach(rule => {
      // If it ends with a conjugated form and is likely a verb (has 'to ' in hint)
      if (meaning.endsWith(rule.from) && word.hint.toLowerCase().includes('to ')) {
          meaning = meaning.substring(0, meaning.length - rule.from.length) + rule.to;
      }
  });

  // 3. Manual verb cleanup (e.g., 'getirmiş' -> 'getirmek')
  if (word.hint.toLowerCase().includes('to ')) {
      if (meaning.endsWith('miş') || meaning.endsWith('mış') || meaning.endsWith('muş') || meaning.endsWith('müş')) {
          const base = meaning.substring(0, meaning.length - 3);
          // Simple heuristic for mek/mak
          if (['e', 'i', 'ö', 'ü'].some(v => base.slice(-1) === v || (base.length > 1 && base.slice(-2,-1) === v))) {
              meaning = base + 'mek';
          } else {
              meaning = base + 'mak';
          }
      }
      // Guaranteeing mek/mak for known verbs
      if (!meaning.endsWith('mek') && !meaning.endsWith('mak') && !meaning.includes(' ')) {
          if (['e', 'i', 'ö', 'ü'].some(v => meaning.slice(-1) === v)) {
              meaning += 'mek';
          } else {
              meaning += 'mak';
          }
      }
  }

  // 4. Case fix
  if (meaning.length > 0) {
      meaning = meaning.charAt(0).toUpperCase() + meaning.slice(1);
  }

  return { ...word, meaning };
});

const output = `const wordsData = ${JSON.stringify(scrubbed, null, 2)};\n\nexport default wordsData;`;
fs.writeFileSync('words.js', output);
console.log('Dataset scrubbed successfully!');
