const fs = require('fs');

const originalFile = 'words.js';
let content = fs.readFileSync(originalFile, 'utf8');

const tempFile = 'words_temp_ultra.js';
let cjsContent = content.replace('export default wordsData;', 'module.exports = wordsData;');
fs.writeFileSync(tempFile, cjsContent);

const wordsData = require('./' + tempFile);
console.log(`Loaded ${wordsData.length} words.`);

const JUNK_TERMS = new Set([
     'jonah', 'jonathan', 'jones', 'jong', 'jordan', 'joseph', 'joshua', 'josiah', 'journey', 'joule', 'jove', 
     'jubal', 'judah', 'judaism', 'judas', 'jude', 'judea', 'judith', 'jules', 'julia', 'julian', 'julie', 'juliet', 'julius', 'june', 'jupiter', 'justin', 'justinian'
]);

const NOUN_SUFFIXES = ['tion', 'ment', 'ness', 'ance', 'ence', 'ity', 'ship', 'hood', 'ism', 'ist', 'ery', 'ary'];

function getMastar(word) {
    const vowels = word.match(/[aeıioöuü]/gi);
    if (!vowels) return 'mak';
    const lastVowel = vowels.pop().toLowerCase();
    return ['a', 'ı', 'o', 'u'].includes(lastVowel) ? 'mak' : 'mek';
}

function normalizeTurkish(m, term) {
    if (!m) return "";
    let clean = m.trim().toLowerCase();
    
    // Hard fixes for the specifically reported bad ones
    if (clean === 'kabulmak' || clean === 'kabulüm') clean = 'kabul';
    if (clean === 'başarımak') clean = 'başarı';
    if (clean === 'amacımak' || clean === 'amacına') clean = 'amacına ulaşmış';
    if (clean === 'edinimmek') clean = 'edinim';
    if (clean === 'eylemimak' || clean === 'eylemi' || clean === 'eylem') clean = 'eylem';
    if (clean === 'aksiyonmak' || clean === 'aksiyon') clean = 'aksiyon';
    if (clean.includes('özrün')) clean = 'özür';
    if (clean.includes('günlüğü')) clean = 'günlük';
    if (clean.includes('fermuarımı')) clean = 'fermuar';

    // Progressive Suffix Stripping for Turkish Roots
    if (!clean.includes(' ')) {
        clean = clean.replace(/(ımı|imi|umu|ümü|yı|yi|yu|yü|nı|ni|nu|nü|orum|ıyorum|iyorum|üyorum|uyorum|dan|den|tan|ten)$/, '');
    }

    // Noun protection
    const isNounSuffix = NOUN_SUFFIXES.some(s => term.endsWith(s));
    if (isNounSuffix && (clean.endsWith('mek') || clean.endsWith('mak'))) {
        clean = clean.slice(0, -3);
    }
    
    return clean;
}

const FIXED_MAP = {
    'abandon': { meaning: 'terk etmek', level: 'B2', example: 'They had to abandon the sinking ship.' },
    'ability': { meaning: 'yetenek', level: 'A2', example: 'She has the ability to solve complex problems.' },
    'above': { meaning: 'yukarısında / üzerinde', level: 'A1', example: 'We live in the apartment above the bakery.' },
    'accepted': { meaning: 'kabul edilmiş', level: 'B1', example: 'It is a generally accepted fact.' },
    'justice': { meaning: 'adalet', level: 'B2', example: 'The judge ensured that justice was served.' },
    'joy': { meaning: 'neşe / sevinç', level: 'B1', example: 'A newborn baby brings much joy.' },
    'zip': { meaning: 'fermuar', level: 'A2', example: 'My jacket zip is broken.' },
    'access': { meaning: 'erişim / erişmek', level: 'B1', example: 'The library provides free internet access.' },
    'across': { meaning: 'karşısında / karşıya', level: 'A1', example: 'The cat ran across the road.' },
    'back': { meaning: 'arka / geri', level: 'A1', example: 'Please step back from the edge.' },
    'zero': { meaning: 'sıfır', level: 'A1', example: 'The score was three to zero.' },
    'acceptance': { meaning: 'kabul', level: 'B1', example: 'His acceptance into university made him happy.' },
    'achievement': { meaning: 'başarı', level: 'A2', example: 'Getting a degree is a great achievement.' },
    'acquisition': { meaning: 'edinim', level: 'B1', example: 'Language acquisition is a natural process.' },
    'action': { meaning: 'eylem', level: 'A1', example: 'Actions speak louder than words.' },
    'achieved': { meaning: 'başarılmış / elde edilmiş', level: 'B2', example: 'The results were achieved after much hard work.' },
    'academy': { meaning: 'akademi', level: 'B1', example: 'She was accepted into the police academy.' },
    'academic': { meaning: 'akademik', level: 'B1', example: 'Academic success requires discipline.' },
    'about': { meaning: 'hakkında / yaklaşık', level: 'A1', example: 'What is this book about?' }
};

const processedWords = wordsData
    .filter(w => !JUNK_TERMS.has(w.term.toLowerCase()))
    .map(w => {
        let term = w.term.toLowerCase().trim();
        let meaning = normalizeTurkish(w.meaning, term);
        let example = w.example;
        let level = w.level;
        let hint = w.hint;

        if (FIXED_MAP[term]) {
            meaning = FIXED_MAP[term].meaning || meaning;
            level = FIXED_MAP[term].level || level;
            example = FIXED_MAP[term].example || example;
        }

        const isVerbHint = hint.toLowerCase().startsWith('to ') || hint.toLowerCase().startsWith('make ');
        const isNounSuffix = NOUN_SUFFIXES.some(s => term.endsWith(s));
        const currentlyHasMastar = meaning.endsWith('mek') || meaning.endsWith('mak') || meaning.includes('etmek') || meaning.includes('yapmak');
        
        if (isVerbHint && !isNounSuffix && !currentlyHasMastar && !meaning.includes(' ')) {
            meaning = meaning + getMastar(meaning);
        }

        if (example.includes("People often use the word") || example.includes("Usage of") || !example || example.length < 5) {
            example = `The word "${term}" is essential for academic and daily communication.`;
        }

        if (term.length <= 3 && level === 'C2') level = 'A1';

        return { term, meaning, hint, example, level };
    });

const output = "const wordsData = [\n" + 
    processedWords.map(w => `  { term: "${w.term}", meaning: "${w.meaning}", hint: "${w.hint.replace(/"/g, "'")}", example: "${w.example.replace(/"/g, "'")}", level: "${w.level}" }`).join(',\n') +
    "\n];\n\nexport default wordsData;";

fs.writeFileSync('words.js', output);
if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
console.log(`ULTRA SUCCESS! Fixed ${processedWords.length} words.`);
