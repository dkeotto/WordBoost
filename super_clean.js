import fs from 'fs';

async function main() {
  const mod = await import('./words.js?timestamp=' + Date.now());
  const wordsData = mod.default;

  const overrides = {
    // Missing letters / bad truncations
    "abrupt": "Ani",
    "bear": "Dayanmak",
    "coast": "Kıyı",
    "dick": "Alet, Penis",
    "end": "Son",
    "ending": "Son",
    "tea": "Çay",
    "blue": "Mavi",
    "mini": "Mini",
    "internet": "İnternet",
    "capital": "Başkent",
    "broadcast": "Yayın, Yayınlamak",
    "fund": "Fon",
    "fun": "Eğlence",
    "mrs": "Hanımefendi",
    "weed": "Ot",
    "menu": "Menü",
    "movie": "Film",
    "noise": "Gürültü",
    "name": "İsim",
    "bell": "Çan",
    "kid": "Çocuk",
    "lie": "Yalan söylemek",
    "link": "Bağlantı",
    "margin": "Kenar boşluğu",
    "tone": "Ton",
    "topic": "Konu",
    "vote": "Oy vermek",
    "wont": "Alışkanlık",
    "joy": "Neşe",
    "juice": "Meyve suyu",
    "guard": "Koruma",
    "hood": "Kapüşon",
    "fare": "Yolcu ücreti",
    "fee": "Ücret",
    
    // Previous script misses & context errors
    "villain": "Kötü adam",
    "cordial": "İçten",
    "death": "Ölüm",
    "station": "İstasyon",
    "website": "Web sitesi",
    "relation": "İlişki",
    "incredible": "İnanılmaz",
    "incredibly": "İnanılmaz",
    "unbelievable": "İnanılmaz",
    "reluctant": "İsteksiz",
    "willing": "İstekli",
    "nearly": "Neredeyse",
    "greatest": "En iyi",
    "best": "En iyi",
    "admit": "İtiraf etmek",
    "admitted": "İtiraf etmek",
    "believes": "İnanmak",
    "bike": "Bisiklet",
    "abandon": "Terk etmek",
    "abrogate": "Yürürlükten kaldırmak",
    "jellyfish": "Deniz anası",
    "brought": "Getirmek",
    "bring": "Getirmek",
    "comment": "Yorum",
    "comments": "Yorumlar",
    "exception": "İstisna",
    "exceptional": "Olağanüstü",
    "defensive": "Savunmacı",
    "installed": "Kurmak",
    "noting": "Dikkat etmek",
    "offshore": "Açık deniz",
    "religious": "Dini",
    "working": "Çalışmak",
    "teaching": "Öğretmek",
    "planning": "Planlamak",
    "reporting": "Raporlamak",
    "recording": "Kaydetmek",
    "viewing": "İzlemek",
    // Final review edge cases
    "across": "Karşısında, Karşıya",
    "back": "Arka, Geri",
    "adverse": "İstenmeyen, Kötü",
    "afraid": "Korkmuş",
    "drinking": "İçmek",
    "forth": "İleri",
    "from": "-den, -dan",
    "definition": "Tanım",
    "gross": "İğrenç",
    "gut": "İçgüdü",
    "healing": "İyileşmek",
    "hopes": "Ummak",
    "imagine": "Hayal etmek",
    "includes": "Kapsamak",
    "increasing": "Artan",
    "increasingly": "Giderek",
    "indicates": "Belirtmek",
    "initially": "İlk olarak",
    "inside": "İçeri",
    "interested": "İlgili",
    "internal": "Dahili",
    "interpretation": "Yorum",
    "invent": "İcat etmek",
    "involves": "İçermek",
    "italian": "İtalyan",
    "italy": "İtalya",
    "joins": "Katılmak",
    "jumps": "Atlamak",
    "just": "Sadece, Az",
    "keeps": "Tutmak, Saklamak",
    "kicking": "Kovmak, Tekmelemek",
    "kissed": "Öpmek",
    "kitten": "Kedi yavrusu",
    "laying": "Yatmak",
    "leads": "İpucu",
    "let": "İzin vermek",
    "likes": "Hoşlanmak",
    "loves": "Sevmek",
    "maintain": "Sürdürmek",
    "manage": "İdare etmek",
    "meat": "Et",
    "neglected": "İhmal edilmiş",
    "noise": "Gürültü",
    "noticeable": "Fark edilebilir",
    "nowhere": "Hiçbir yer",
    "old": "İhtiyar, Eski",
    "online": "Çevrimiçi",
    "optimal": "Optimal",
    "people": "İnsanlar",
    "perfect": "Mükemmel",
    "persuade": "İkna etmek",
    "plus": "Artı",
    "primary": "Temel, Ana",
    "profit": "Kâr",
    "protected": "Korunmuş",
    "prove": "İspatlamak",
    "put": "Koymak",
    "rebel": "İsyan etmek",
    "remember": "Hatırlamak",
    "rising": "Yükselen",
    "run": "Koşmak",
    "runs": "Koşmak",
    "said": "Söylenen",
    "scotland": "İskoçya",
    "seeing": "Görmek",
    "seemed": "Görünmek",
    "selling": "Satmak",
    "set": "Kurmak",
    "silver": "Gümüş",
    "solid": "Katı",
    "spanish": "İspanyolca",
    "state": "İfade etmek",
    "statement": "İfade",
    "steady": "İstikrarlı",
    "subject": "Konu",
    "suit": "Yakışmak",
    "things": "İşler",
    "thinks": "Düşünmek",
    "thousand": "Bin",
    "ulster": "Uzun palto",
    "understood": "Anlamak",
    "unite": "Birleşmek",
    "using": "Kullanmak",
    "valley": "Vadi",
    "violate": "İhlal etmek",
    "visions": "Görüler",
    "vomiting": "Kusmak",
    "waking": "Uyanmak",
    "wanted": "İstenen",
    "wants": "İstemek",
    "weaker": "Zayıflayan",
    "wearing": "Giyen, Takan",
    "wears": "Giyinmek",
    "weed": "Ot",
    "western": "Batı",
    "will": "İrade",
    "witch": "Cadı"
  };

  const verbEndings = [
    'yordu', 'yordı', 'ıyordu', 'iyordu', 'uyordu', 'üyordu', 'ıyor', 'iyor', 'uyor', 'üyor', 
    'acaklar', 'ecekler', 'acaktı', 'ecekti', 'acak', 'ecek', 
    'mişler', 'mışlar', 'muşlar', 'müşler', 'mişsin', 'mışsın', 
    'mış', 'miş', 'muş', 'müş', 
    'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü',
    'dılar', 'diler', 'tılar', 'tiler'
  ];

  const scrubbed = wordsData.map(word => {
    let meaning = word.meaning.trim();
    let term = word.term.toLowerCase();

    if (overrides[term]) {
      return { ...word, meaning: overrides[term] };
    }

    // Clean up unwanted injected "mak"/"mek" from previous errors
    if (meaning.endsWith('mak') || meaning.endsWith('mek')) {
       const base = meaning.slice(0, -3);
       // Check if it's an adjective that mistakenly got it
       if (['İnanılmaz', 'İsteksiz', 'İlişki', 'İnternet', 'Güzel', 'Kötü', 'Hızlı'].some(a => base.includes(a))) {
           meaning = meaning.replace(/mek|mak/g, '');
       }
    }

    // Strip past tenses
    let isVerb = word.hint.toLowerCase().includes('to ');
    
    // Explicit exclusions that may contain 'to ' in hint but are NOT verbs
    const nonVerbs = ['station', 'relation', 'website', 'kid', 'death', 'internet', 'movie'];
    if (nonVerbs.includes(term)) isVerb = false;

    if (isVerb) {
       for (const rule of verbEndings) {
           if (meaning.toLowerCase().endsWith(rule) && meaning.length > (rule.length + 2)) {
               meaning = meaning.substring(0, meaning.length - rule.length);
               break;
           }
       }

       if (!meaning.endsWith('mek') && !meaning.endsWith('mak') && meaning.length > 2) {
           const lastVowelMatch = meaning.match(/[aeıioöuüAEIİOÖUÜ]/g);
           const lastVowel = lastVowelMatch ? lastVowelMatch.pop().toLowerCase() : 'e';
           if (['e', 'i', 'ö', 'ü'].includes(lastVowel)) {
               meaning += 'mek';
           } else {
               meaning += 'mak';
           }
       }
    } else {
      // Remove trailing copulas for adjectives/nouns (ydi, ydu, ti, tu)
      const copulas = ['tu', 'tü', 'tı', 'ti', 'ydı', 'ydi', 'ydu', 'ydü'];
      for (const cop of copulas) {
         if (meaning.endsWith(cop) && meaning.length > (cop.length + 2)) {
             meaning = meaning.substring(0, meaning.length - cop.length);
             break;
         }
      }
    }

    // Strip dangling prepositions
    const fragments = [' maya', ' meye', ' dan', ' den', ' tan', ' ten', ' gibi', ' olan', ' a', ' e', ' ya', ' ye'];
    fragments.forEach(f => {
      if (meaning.endsWith(f)) meaning = meaning.substring(0, meaning.length - f.length);
    });

    if (meaning.length > 0) {
        meaning = meaning.charAt(0).toUpperCase() + meaning.slice(1);
    }

    return { ...word, meaning };
  });

  const output = `const wordsData = ${JSON.stringify(scrubbed, null, 2)};\n\nexport default wordsData;`;
  fs.writeFileSync('words.js', output, 'utf8');
}

main().catch(console.error);
