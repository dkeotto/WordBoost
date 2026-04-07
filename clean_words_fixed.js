/**
 * clean_words_fixed.js
 * Cleans words_fixed.js (7481 words) - the REAL source used by the app.
 * Fixes: meanings, hints, examples.
 */
const fs = require('fs');

const raw = require('./words_fixed.js');

// ─── Manual overrides for specific bad meanings ──────────────────────────────
const meaningOverrides = {
  "zoo": "Hayvanat bahçesi",
  "zoom": "Yaklaştırmak; hızlanmak",
  "abandon": "Terk etmek",
  "abandoned": "Terk edilmiş",
  "ability": "Beceri, yetenek",
  "able": "Yapabilen, muktedir",
  "bear": "Ayı; taşımak, katlanmak",
  "beautiful": "Güzel",
  "beauty": "Güzellik",
  "because": "Çünkü",
  "become": "Olmak",
  "begin": "Başlamak",
  "believe": "İnanmak",
  "best": "En iyi",
  "better": "Daha iyi",
  "between": "Arasında",
  "big": "Büyük",
  "book": "Kitap; rezerve etmek",
  "break": "Kırmak; mola",
  "bring": "Getirmek",
  "build": "İnşa etmek",
  "buy": "Satın almak",
  "can": "Yapabilmek; teneke kutu",
  "car": "Araba",
  "care": "Özen göstermek; bakım",
  "carry": "Taşımak",
  "change": "Değişmek; değişim",
  "child": "Çocuk",
  "choose": "Seçmek",
  "city": "Şehir",
  "close": "Kapatmak; yakın",
  "come": "Gelmek",
  "continue": "Devam etmek",
  "control": "Kontrol etmek; kontrol",
  "country": "Ülke",
  "create": "Yaratmak",
  "cut": "Kesmek",
  "day": "Gün",
  "dead": "Ölü",
  "deal": "Anlaşmak; fırsat",
  "decide": "Karar vermek",
  "develop": "Geliştirmek",
  "die": "Ölmek",
  "difficult": "Zor",
  "do": "Yapmak",
  "dog": "Köpek",
  "dollar": "Dolar",
  "down": "Aşağı",
  "draw": "Çizmek",
  "drive": "Sürmek",
  "drop": "Düşürmek; damla",
  "each": "Her biri",
  "early": "Erken",
  "easy": "Kolay",
  "eat": "Yemek",
  "end": "Bitmek; son",
  "enough": "Yeterli",
  "enter": "Girmek",
  "environment": "Çevre",
  "every": "Her",
  "expect": "Beklemek",
  "explain": "Açıklamak",
  "face": "Yüz; yüzleşmek",
  "fact": "Gerçek",
  "fall": "Düşmek; sonbahar",
  "family": "Aile",
  "fast": "Hızlı",
  "feel": "Hissetmek",
  "few": "Az sayıda",
  "find": "Bulmak",
  "follow": "Takip etmek",
  "food": "Yemek",
  "force": "Zorlamak; kuvvet",
  "friend": "Arkadaş",
  "full": "Dolu",
  "future": "Gelecek",
  "game": "Oyun",
  "get": "Almak",
  "give": "Vermek",
  "go": "Gitmek",
  "good": "İyi",
  "government": "Hükümet",
  "great": "Harika; büyük",
  "grow": "Büyümek",
  "hand": "El",
  "happen": "Olmak",
  "happy": "Mutlu",
  "hard": "Zor; sert",
  "have": "Sahip olmak",
  "head": "Baş; yönetmek",
  "health": "Sağlık",
  "hear": "Duymak",
  "help": "Yardım etmek",
  "high": "Yüksek",
  "hold": "Tutmak",
  "home": "Ev",
  "hope": "Ummak",
  "house": "Ev",
  "human": "İnsan; insani",
  "idea": "Fikir",
  "important": "Önemli",
  "increase": "Artmak; artış",
  "information": "Bilgi",
  "keep": "Tutmak",
  "kill": "Öldürmek",
  "know": "Bilmek",
  "large": "Büyük",
  "last": "Son; sürmek",
  "late": "Geç",
  "learn": "Öğrenmek",
  "leave": "Ayrılmak; bırakmak",
  "let": "İzin vermek",
  "life": "Hayat",
  "like": "Sevmek; gibi",
  "listen": "Dinlemek",
  "little": "Az; küçük",
  "live": "Yaşamak",
  "long": "Uzun",
  "look": "Bakmak",
  "lose": "Kaybetmek",
  "love": "Sevmek; aşk",
  "low": "Alçak; düşük",
  "make": "Yapmak",
  "man": "Adam",
  "mean": "Demek istemek; ortalama",
  "meet": "Buluşmak",
  "money": "Para",
  "move": "Taşınmak; hareket etmek",
  "much": "Çok",
  "must": "Zorunlu olmak",
  "name": "Ad",
  "need": "İhtiyaç duymak",
  "never": "Asla",
  "new": "Yeni",
  "next": "Sonraki",
  "night": "Gece",
  "note": "Not; dikkat etmek",
  "number": "Sayı",
  "offer": "Teklif etmek",
  "old": "Eski; yaşlı",
  "open": "Açmak; açık",
  "people": "İnsanlar",
  "place": "Yer; yerleştirmek",
  "plan": "Plan yapmak; plan",
  "play": "Oynamak",
  "point": "Nokta; işaret etmek",
  "position": "Konum; pozisyon",
  "power": "Güç",
  "problem": "Sorun",
  "program": "Program",
  "public": "Halka açık; kamu",
  "put": "Koymak",
  "question": "Soru; sorgulamak",
  "quickly": "Hızlıca",
  "read": "Okumak",
  "real": "Gerçek",
  "reason": "Neden; mantık yürütmek",
  "receive": "Almak",
  "remember": "Hatırlamak",
  "require": "Gerektirmek",
  "result": "Sonuç",
  "return": "Geri dönmek",
  "right": "Doğru; sağ; hak",
  "rise": "Yükselmek; artmak",
  "road": "Yol",
  "room": "Oda; alan",
  "run": "Koşmak; çalışmak",
  "say": "Söylemek",
  "school": "Okul",
  "see": "Görmek",
  "seem": "Görünmek",
  "send": "Göndermek",
  "set": "Ayarlamak; küme",
  "show": "Göstermek; gösteri",
  "simple": "Basit",
  "since": "O zamandan beri; çünkü",
  "small": "Küçük",
  "some": "Bazı",
  "speak": "Konuşmak",
  "stand": "Ayakta durmak",
  "start": "Başlamak",
  "state": "Devlet; durum; belirtmek",
  "stay": "Kalmak",
  "stop": "Durmak",
  "student": "Öğrenci",
  "study": "Çalışmak; çalışma",
  "sure": "Emin",
  "system": "Sistem",
  "take": "Almak",
  "talk": "Konuşmak",
  "tell": "Anlatmak",
  "thing": "Şey",
  "think": "Düşünmek",
  "time": "Zaman",
  "today": "Bugün",
  "together": "Birlikte",
  "tomorrow": "Yarın",
  "try": "Denemek",
  "turn": "Dönmek; sıra",
  "understand": "Anlamak",
  "use": "Kullanmak",
  "view": "Görünüm; bakmak",
  "want": "İstemek",
  "watch": "İzlemek; saat",
  "water": "Su",
  "way": "Yol; yöntem",
  "week": "Hafta",
  "well": "İyi; pekâlâ",
  "whole": "Bütün",
  "why": "Neden",
  "with": "İle",
  "woman": "Kadın",
  "word": "Kelime",
  "work": "Çalışmak; iş",
  "world": "Dünya",
  "write": "Yazmak",
  "year": "Yıl",
  "yet": "Henüz; yine de",
  "young": "Genç",
  // Truncated / bad meanings
  "abrupt": "Ani; sert",
  "absent": "Devamsız; yok",
  "coast": "Kıyı",
  "dick": "Alet, penis (argo)",
  "nearly": "Neredeyse",
  "tea": "Çay",
  "villain": "Kötü adam",
  "website": "Web sitesi",
  "zoom in": "Yakınlaştırmak",
  "zurich": "Zürih",
};

// ─── Bad hint / example patterns to sanitize ─────────────────────────────────
const BAD_EXAMPLE_PATTERNS = [
  /People often use the word .+ in real communication/i,
  /^The word .+ is commonly used\.?$/i,
  /^This word is used in everyday situations\.?$/i,
];

const BAD_HINT_PATTERNS = [
  /^\(This word.*\)\.?$/i,
];

function isBadExample(s) {
  if (!s) return true;
  const t = String(s).trim();
  if (t.length < 5) return true;
  return BAD_EXAMPLE_PATTERNS.some((p) => p.test(t));
}

function isBadHint(s, term) {
  if (!s) return false;
  const t = String(s).trim();
  if (BAD_HINT_PATTERNS.some((p) => p.test(t))) return true;
  // If the hint just repeats the term with "the word X" boilerplate
  if (new RegExp(`^The word ${term}`, 'i').test(t)) return true;
  return false;
}

function capitalize(s) {
  const t = String(s || '').trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Process dataset ─────────────────────────────────────────────────────────
let fixedMeanings = 0;
let fixedExamples = 0;

const cleaned = raw.map((word) => {
  const term = String(word.term || '').trim().toLowerCase();
  let meaning = String(word.meaning || '').trim();
  let hint = String(word.hint || '').trim();
  let example = String(word.example || '').trim();

  // Apply manual overrides
  if (meaningOverrides[term]) {
    if (meaning !== meaningOverrides[term]) {
      fixedMeanings++;
      meaning = meaningOverrides[term];
    }
  } else {
    // Capitalize first letter of meaning
    meaning = capitalize(meaning);
  }

  // Clear bad examples
  if (isBadExample(example)) {
    fixedExamples++;
    example = '';
  }

  // Clear bad hints
  if (isBadHint(hint, term)) {
    hint = '';
  }

  // Trim everything
  return {
    term: word.term,
    meaning,
    hint: hint || undefined,
    example: example || undefined,
    level: word.level,
  };
});

// Write back
const out = `const wordsData = ${JSON.stringify(cleaned, null, 2)};\n\nif (typeof module !== 'undefined') module.exports = wordsData;\n`;
fs.writeFileSync('./words_fixed.js', out, 'utf8');
console.log(`✅ Done! Fixed ${fixedMeanings} meanings, ${fixedExamples} examples.`);
console.log(`📚 Total words: ${cleaned.length}`);
