require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const REPORT_FILE = path.join(__dirname, 'semantic_suggestions.json');

const WordSchema = new mongoose.Schema({
  term: { type: String },
  meaning: { type: String },
  hint: { type: String },
  example: { type: String },
  level: { type: String }
});

const Word = mongoose.model('Word', WordSchema);

async function callAi(wordsBatch) {
  const apiKey = process.env.GROQ_API_KEY;

  const prompt = `Sen ana dili Ingilizce ve Turkce olan bir dilbilimci professorsun. Sana JSON formatinda kelimeler verecegim.
Gorevin: Term (Ogrenilen Ingilizce kelime), Meaning (Turkce anlami), Hint (Anahtar kelime/ipucu), Example (Ornek Ingilizce cumle) ve Level (CEFR A1-C2) uyumunu kontrol et.
- Eger kelime her acioan MUKEMMEL ve dogal ise, "ok": true dondur.
- Eger anlami yanlissa, ipucu mantiksizsa, ornek cumle gramer veya baglam olarak bozuksa veya kelimenin seviyesi yanlissa "ok": false dondur ve "correction" objesi icine mukemmel ve duzeltilmis hallerini (meaning, hint, example, level) yaz.
- Ayrica sorunun ne oldugunu "reason" olarak Turkce kisaca acikla.

Input:
${JSON.stringify(wordsBatch, null, 2)}

SADECE JSON DIZISI DONDUR. Kesinlikle baska yazi veya aciklama yazma. Eger JSON disinda bir kelime bile yazarsan sistem coker.
Format:
[
  {
    "_id": "kelime idsini aynen yaz",
    "term": "kelimeyi yaz",
    "ok": true VEYA false,
    "reason": "eger hata varsa hatanin aciklamasi (Turkce)",
    "correction": {
        "meaning": "...",
        "hint": "...",
        "example": "...",
        "level": "..."
    }
  }
]
`;

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: "json_object" },
      messages: [{ role: 'system', content: 'You must always return a JSON object with a "data" array containing the results. Output nothing but JSON.' }, { role: 'user', content: prompt }],
      temperature: 0.1
    })
  });

  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

  const text = data.choices && data.choices[0] ? data.choices[0].message.content : '';
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    return JSON.parse(text.substring(start, end + 1));
  } catch (e) {
    console.warn("AI JSON donmedi. Ham cikti:", text);
    throw new Error("Invalid format from AI");
  }
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Verification Started (Read-Only)...");
    
    const words = await Word.find({});
    console.log(`Veritabaninda ${words.length} kelime bulundu.`);
    
    let processedIds = new Set();
    let suggestions = [];

    // Mevcut rapor dosyasini oku (Kaldigi yerden devam etmesi icin)
    if (fs.existsSync(REPORT_FILE)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
        suggestions = Array.isArray(existingData) ? existingData : [];
        existingData.forEach(item => processedIds.add(item._id));
        console.log(`Onceki rapordan ${processedIds.size} islenmis kelime bulundu. Kaldigi yerden devam edilecek.`);
      } catch (e) {
        console.log("Eski rapor dosyasi okunamadi, sifirdan baslaniyor.");
      }
    }

    const pendingWords = words.filter(w => !processedIds.has(w._id.toString()));
    console.log(`Taranacak ${pendingWords.length} kelime kaldi.`);

    const BATCH_SIZE = 10;
    
    // Tüm veritabanını hatasız taraması için limit kaldırıldı.
    const runLimit = pendingWords.length; 
    
    for (let i = 0; i < runLimit; i += BATCH_SIZE) {
      const batchRaw = pendingWords.slice(i, i + BATCH_SIZE);
      const batchData = batchRaw.map(w => ({
        _id: w._id.toString(),
        term: w.term,
        meaning: w.meaning,
        hint: w.hint,
        example: w.example,
        level: w.level
      }));

      console.log(`[${i}/${runLimit}] AI Analizi Yapiliyor...`);
      try {
        const results = await callAi(batchData);
        
        // Hatalilari filtreleyip rapora kaydet
        const faulty = results.filter(r => r.ok === false);
        if (faulty.length > 0) {
          console.log(`  -> ${faulty.length} kelimede mantik/gramer hatasi bulundu! Raporlaniyor...`);
          faulty.forEach(f => {
            const original = batchData.find(b => b._id === f._id);
            suggestions.push({
              _id: f._id,
              term: f.term,
              reason: f.reason,
              original: original,
              correction: f.correction || {}
            });
          });
        } else {
           console.log(`  -> Batch icindeki butun kelimeler mukemmel.`);
        }

        // Basarili donenleri 'processed' olarak isaretle
        results.forEach(r => processedIds.add(r._id));

        // Rapor dosyasini fiziksel olarak GUNCELLE (Backup mantigi)
        fs.writeFileSync(REPORT_FILE, JSON.stringify(suggestions, null, 2), 'utf8');

        // Rate limit bekleme suresi
        await new Promise(res => setTimeout(res, 2000));
        
      } catch (e) {
        console.error(`  -> Hata: ${e.message}. Bir sonraki denemeye geciliyor.`);
        await new Promise(res => setTimeout(res, 5000));
      }
    }

    console.log(`Tarama tamamlandi. Yeni oneriler ${REPORT_FILE} dosyasina yazildi.`);
    console.log("Not: Tum 7481 kelimeyi taramak istersen script limitlerini kaldirip tekrar calistirabilirsin.");

  } catch(e) {
    console.error("Hata:", e);
  } finally {
    process.exit(0);
  }
}

run();
