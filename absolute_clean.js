import fs from 'fs';

async function main() {
  const mod = await import('./words.js?timestamp=' + Date.now());
  const wordsData = mod.default;

  const overrides = {
    "accident": "Kaza",
    "after": "Sonra",
    "behavior": "Davranış",
    "birth": "Doğum",
    "city": "Şehir",
    "control": "Kontrol",
    "district": "Bölge",
    "edge": "Kenar",
    "existed": "Var olmak",
    "exists": "Var olmak",
    "front": "Ön",
    "future": "Gelecek",
    "heart": "Kalp",
    "heights": "Yükseklikler",
    "house": "Ev",
    "inside": "İçeri",
    "low": "Alçak",
    "midnight": "Gece yarısı",
    "mile": "Mil",
    "morning": "Sabah",
    "murder": "Cinayet",
    "off": "Kapalı, Uzak",
    "outer": "Dış",
    "overlooked": "Göz ardı edilmiş",
    "point": "Nokta",
    "pounds": "Pound",
    "province": "Eyalet, İl",
    "security": "Güvenlik",
    "somewhere": "Bir yer",
    "source": "Kaynak",
    "spending": "Harcama",
    "sure": "Emin",
    "tomorrow": "Yarın",
    "topic": "Konu",
    "undergone": "Geçirmek",
    "unleashed": "Serbest bırakılmış",
    "unnoticed": "Fark edilmemiş",
    "vehicle": "Araç",
    "beautiful": "Güzel",
    "dollar": "Dolar",
    "zone": "Bölge",
    "zoo": "Hayvanat bahçesi",
    "zoning": "İmar",
    "zombies": "Zombiler",
    "zones": "Bölgeler",
    "washing": "Yıkama",
    "winning": "Kazanma",
    "loving": "Sevme",
    "windows": "Windows",
    "window": "Pencere",
    "waist": "Bel",
    "word": "Kelime",
    "words": "Kelimeler",
    // Fix plurals mistakenly added to verbs
    "coming": "Gelen",
    "bringing": "Getiren",
    "throwing": "Fırlatan",
    "died": "Öldü"
  };

  const scrubbed = wordsData.map(word => {
    let meaning = word.meaning.trim();
    let term = word.term.toLowerCase();

    if (overrides[term]) {
      return { ...word, meaning: overrides[term] };
    }

    // Heuristically fix remaining "-den" / "-dan" / "-ten" / "-tan" errors
    // BUT only when we are 100% sure it's a suffix!
    // Safe roots to strip ablative cases from:
    const ablatives = [
      { suffix: 'den', roots: ['Şehir', 'İçeri', 'Gelecek', 'Ev', 'Üst', 'Yüz', 'Nere'] },
      { suffix: 'dan', roots: ['Kaza', 'Doğum', 'Kalp', 'Sabah', 'Yarın', 'Kapı', 'Ora', 'Bura'] },
      { suffix: 'ten', roots: ['Cinayet', 'Nihayet', 'Gül'] },
      { suffix: 'tan', roots: ['Ufak', 'Uzaktan', 'Alçak'] }
    ];

    for (let ab of ablatives) {
      if (meaning.endsWith(ab.suffix) && meaning.length > 5) {
        let base = meaning.substring(0, meaning.length - ab.suffix.length).trim();
        // Check if stripping leaves a weird lingering vowel (e.g. bölgesin-den -> bölge)
        if (base.endsWith('n') || base.endsWith('in') || base.endsWith('ın')) {
          base = base.replace(/n$/, '').replace(/in$/, '').replace(/ın$/, '').replace(/sin$/, '');
        }
      }
    }

    // Correctly match Plurals.
    // If the english term doesn't end in 's', and the turkish meaning does ends in 'ler/lar',
    // it's highly likely a bad pluralization (unless words like "Kader", "Haber", "Zar").
    if (!term.endsWith('s') && !['news', 'series', 'species'].includes(term)) {
      if (meaning.toLowerCase().endsWith('ler')) {
        const base = meaning.slice(0, -3);
        if (!['Keler', 'Kiler', 'Haber', 'Gider', 'Önder', 'Bira', 'Ejder', 'Bakteriler'].some(e => meaning.includes(e))) {
          // Too risky to auto-strip. Left the hardcoded overrides above.
        }
      }
    }

    return { ...word, meaning };
  });

  const output = `const wordsData = ${JSON.stringify(scrubbed, null, 2)};\n\nexport default wordsData;`;
  fs.writeFileSync('words.js', output, 'utf8');
}

main().catch(console.error);
