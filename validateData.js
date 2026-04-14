require('dotenv').config();
const mongoose = require('mongoose');

const WordSchema = new mongoose.Schema({
  term: { type: String },
  meaning: { type: String },
  hint: { type: String },
  example: { type: String },
  level: { type: String }
});

const Word = mongoose.model('Word', WordSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB Verification Started...");
    
    const words = await Word.find({});
    console.log(`Verifying ${words.length} items...`);
    
    let anomalies = [];
    let emptyAnomalies = [];
    let formattingAnomalies = [];

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      let needsSave = false;

      // Check Term
      if (!w.term || typeof w.term !== 'string' || w.term.trim() === '') {
        emptyAnomalies.push(`ID ${w._id}: BOŞ KELİME! Silinmeli.`);
      } else if (w.term !== w.term.trim()) {
        formattingAnomalies.push(`ID ${w._id}: '${w.term}' -> Baş/son boşluk var.`);
        w.term = w.term.trim();
        needsSave = true;
      }

      // Check Meaning
      if (!w.meaning || typeof w.meaning !== 'string' || w.meaning.trim() === '') {
        emptyAnomalies.push(`ID ${w._id} (${w.term}): Anlam (Meaning) yok!`);
      } else if (w.meaning !== w.meaning.trim()) {
        w.meaning = w.meaning.trim();
        needsSave = true;
      }

      if (needsSave) {
        await w.save();
        anomalies.push(`ID ${w._id} (${w.term}): Format hataları otomatik düzeltildi.`);
      }
    }

    console.log(`\n=== Tarama Tamamlandı ===`);
    console.log(`Toplam otomatik temizlenen kayıt: ${anomalies.length}`);
    console.log(`Kritik/Boş (Müdahale Gerekli) hata sayısı: ${emptyAnomalies.length}`);
    
    if (emptyAnomalies.length > 0) {
      console.log('Kritik Hatalar:');
      console.log(emptyAnomalies.slice(0, 30).join('\n'));
      if (emptyAnomalies.length > 30) console.log(`...ve ${emptyAnomalies.length - 30} tane daha.`);
    }

  } catch(e) {
    console.error("Hata:", e);
  } finally {
    process.exit(0);
  }
}

run();
