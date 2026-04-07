const fs = require('fs');
const wordsData = require('./words').default;

const scrubbed = wordsData.map(word => {
  let meaning = word.meaning;
  let term = word.term.toLowerCase();

  // 1. Specific Fixes (Truncation/Errors)
  if (term === 'jellyfish' && meaning.toLowerCase().includes('anası')) meaning = 'Deniz anası';
  if (term === 'brought') meaning = 'Getirmek';
  if (term === 'bring') meaning = 'Getirmek';
  if (term === 'abandon') meaning = 'Terk etmek';
  if (term === 'abrogate') meaning = 'Yürürlükten kaldırmak';

  // 2. Fragment Removal (Fixing cut-off suffixes at end of strings)
  const fragments = [' maya', ' meye', ' dan', ' den', ' tan', ' ten', ' gibi', ' olan'];
  fragments.forEach(f => {
    if (meaning.endsWith(f)) {
      meaning = meaning.substring(0, meaning.length - f.length);
    }
  });

  // 3. Verb Normalization (Turkish suffixes)
  const verbEnds = [
    { from: 'mişsin', to: 'mek' },
    { from: 'mişler', to: 'mek' },
    { from: 'mışlar', to: 'mak' },
    { from: 'ıyor', to: 'mak' },
    { from: 'iyor', to: 'mek' },
    { from: 'uyor', to: 'mak' },
    { from: 'üyor', to: 'mek' },
    { from: 'umuş', to: 'mak' },
    { from: 'ümüş', to: 'mek' },
    { from: 'mış', to: 'mak' },
    { from: 'miş', to: 'mek' },
    { from: 'muş', to: 'mak' },
    { from: 'müş', to: 'mek' },
    { from: 'acaktı', to: 'mak' },
    { from: 'ecekti', to: 'mek' }
  ];

  const isVerb = word.hint.toLowerCase().includes('to ') || meaning.endsWith('mek') || meaning.endsWith('mak');

  if (isVerb) {
    verbEnds.forEach(rule => {
        if (meaning.toLowerCase().endsWith(rule.from)) {
            meaning = meaning.substring(0, meaning.length - rule.from.length) + rule.to;
        }
    });

    // Ensure ending is mek/mak if it sounds like a verb
    if (!meaning.toLowerCase().endsWith('mek') && !meaning.toLowerCase().endsWith('mak') && !meaning.includes(' ')) {
        const lastVowel = meaning.match(/[aeıioöuü]/g)?.pop();
        if (['e', 'i', 'ö', 'ü'].includes(lastVowel)) {
            meaning += 'mek';
        } else {
            meaning += 'mak';
        }
    }
  }

  // 4. Proper Capitalization
  if (meaning.length > 0) {
      meaning = meaning.trim();
      meaning = meaning.charAt(0).toUpperCase() + meaning.slice(1);
  }

  return { ...word, meaning };
});

const output = `const wordsData = ${JSON.stringify(scrubbed, null, 2)};\n\nexport default wordsData;`;
fs.writeFileSync('words.js', output);
console.log('Dataset scrubbed successfully!');
