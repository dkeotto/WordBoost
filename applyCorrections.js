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

async function applyCorrections() {
  if (!fs.existsSync(REPORT_FILE)) {
    console.log("Hata: semantic_suggestions.json dosyasi bulunamadi.");
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB'ye baglanildi. Duzeltmeler basliyor...");

    const suggestions = JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8'));
    console.log(`Toplam ${suggestions.length} oneri dosyadan okundu.`);

    let successCount = 0;
    
    for (const item of suggestions) {
      const correction = item.correction;
      if (!correction || Object.keys(correction).length === 0) {
        console.log(`Atlandi: ${item.term} (Gecerli bir correction objesi yok)`);
        continue;
      }

      const updateData = {};
      if (correction.meaning) updateData.meaning = correction.meaning;
      if (correction.hint) updateData.hint = correction.hint;
      if (correction.example) updateData.example = correction.example;
      if (correction.level) updateData.level = correction.level;

      await Word.findByIdAndUpdate(item._id, { $set: updateData });
      console.log(`[Düzeltildi]: ${item.term}`);
      successCount++;
    }

    console.log(`\n🎉 Islem tamamlandi! Toplam ${successCount} kelimenin anlami/seviyesi/ipucu MongoDB uzerinde guncellendi.`);
    console.log(`Not: Onaylanan listeyi tasimak istersen, ${REPORT_FILE} dosyasinin ismini degistirip saklayabilirsin.`);
    
  } catch (err) {
    console.error("Uygulama basarisiz oldu:", err);
  } finally {
    process.exit(0);
  }
}

applyCorrections();
