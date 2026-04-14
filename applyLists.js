const fs = require('fs');
const path = require('path');

function applyToList(listName, jsonReportName, jsFileName, exportName) {
  const reportPath = path.join(__dirname, jsonReportName);
  const targetPath = path.join(__dirname, 'ydt-kelime-pratigi', 'src', 'data', jsFileName);

  if (!fs.existsSync(reportPath)) {
    console.log(`[Atlandi] ${jsonReportName} dosyasi bulunamadi. Onceden tarama yapilmis olmayabilir.`);
    return;
  }

  const suggestions = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (suggestions.length === 0) {
    console.log(`[Atlandi] ${listName} listesinde degisecek hicbir bozuk veri bulunamadi (Zaten mukemmel).`);
    return;
  }

  console.log(`\n[${listName}] listesinde ${suggestions.length} duzeltme yapiliyor...`);

  // JS dosyasindan ham datayi okuyup gecici olarak eval ile diziye ceviriyoruz.
  const content = fs.readFileSync(targetPath, 'utf8');
  const arrayString = content.replace(`export const ${exportName} =`, '').trim().replace(/;$/, '');
  let dataArray = [];
  try {
    dataArray = eval(`(${arrayString})`);
  } catch(e) {
    console.error("Mevcut liste cozumlenemedi, islem iptal.");
    return;
  }

  // Duzeltmeleri orijinal dizinin icine id_index e gore sapliyoruz
  let updatedCount = 0;
  for (const item of suggestions) {
    const idx = item.id_index;
    if (idx !== undefined && idx >= 0 && idx < dataArray.length && item.correction && Object.keys(item.correction).length > 0) {
      // Degisikligi yap
      dataArray[idx] = { ...dataArray[idx], ...item.correction };
      updatedCount++;
    }
  }

  // Degistirilmis diziyi yepyeni bir JS kodu olarak dosyaya yazdiriyoruz.
  // JSON formatli anahtarlar, JS dosyasi icinde tamamen gecerli ve sorunsuzdur.
  const newJsContent = `export const ${exportName} = ${JSON.stringify(dataArray, null, 2)};\n`;
  fs.writeFileSync(targetPath, newJsContent, 'utf8');

  console.log(`[${listName}] Bitti! Toplam ${updatedCount} adet duzeltme ${jsFileName} dosyasina gömüldü.`);
}

function run() {
  applyToList('Synonyms', 'semantic_suggestions_synonyms.json', 'curatedSynonyms.js', 'CURATED_SYNONYMS');
  applyToList('Phrasal Verbs', 'semantic_suggestions_phrasal.json', 'curatedPhrasalVerbs.js', 'CURATED_PHRASAL_VERBS');

  console.log(`\n✨ Tum dosya tabanli Frontend degisiklikleri tamamlandi!`);
  console.log(`Dikkat: Bu islemler frontend (React) dosyalarini degistirdigi icin Vercel'in haberi olmasi adina Vercel'e Push (git push) atmalisin.`);
}

run();
