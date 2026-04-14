const fs = require('fs');
const path = require('path');

const apiKey = process.env.GROQ_API_KEY;

async function callAi(batch, type) {
  const isSynonym = type === 'synonyms';
  
  const prompt = `Sen Ingilizce ve Turkceyi ana dili gibi bilen bir C2 seviyesi dilbilimci ve egitimcisin.
Bana verilen coktan secmeli YDT/YDS soru uretim verilerini inceleyeceksin.
Tip: ${isSynonym ? 'Eş Anlamlı Kelimeler (Synonyms)' : 'Deyimsel Fiiller (Phrasal Verbs)'}

Sana JSON objeleri verecegim. Her objenin:
${isSynonym ? '- question: Sorulan ana kelime\n- correct: Dogru es anlamlisi\n- options: 4 adet sik (icinde correct olan kelime mutlaka var)' : '- base: Ana fiil (ornek: look)\n- correct: Dogru phrasal verb (ornek: look after)\n- options: 4 adet sik (icinde correct olan kelime mutlaka var)'}
- level: CEFR Zorluk seviyesi.

Gorevin:
1. Semantik Kontrol: 'correct' kelimesi gercekten ana kelimenin dogru karsiligi mi?
2. Celdirici Kontrolu: 'options' icindeki diger 3 yanlis sik cok mu sacma, ayni anlama mi geliyor (hatali soru) yoksa guzel celdiriciler mi? Yanlis siklar "uyumsuz/yanlis" olmalidir ancak gramer olarak asiri sacma durmamali.
3. Eger her sey MUKEMMEL ise (dogru cevap gercekten dogruysa ve celdiriciler hatasizsa), "ok": true dondur.
4. Eger hata varsa "ok": false dondur, "reason" kismina sorunu Turkce acikla. "correction" icinde de sadece guncellenmis objeyi (level, ${isSynonym ? 'question' : 'base'}, correct, options) tam ve kusursuz haliyle yaz.

Input:
${JSON.stringify(batch, null, 2)}

SADECE JSON DIZISI DONDUR. Baska aciklama ekleme.
Format:
[
  {
    "id_index": "gonderidigim listedeki sirasi/indeksi",
    "ok": true VEYA false,
    "reason": "hata varsa hatanin aciklamasi",
    "correction": {
        // duzeltilmis json objesi buraya
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
      messages: [{ role: 'system', content: 'You must return a JSON object with a "data" array containing the results.' }, { role: 'user', content: prompt }],
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

function loadData(filePath, exportName) {
  const content = fs.readFileSync(filePath, 'utf8');
  // 'export const NAME = [' -> '['
  const arrayString = content.replace(`export const ${exportName} =`, '').trim().replace(/;$/, '');
  
  try {
    // eval guvenli degil ama lokal dosyadan okudugumuz ve formati bildigimiz icin basit cozum.
    // JSON.parse calismaz cunku keyler tirnaksiz (ornegin level: "A1").
    return eval(`(${arrayString})`); 
  } catch (e) {
    console.error(`Dosya parse edilemedi: ${filePath}`);
    return [];
  }
}

async function scanList(type, dataList) {
  const REPORT_FILE = path.join(__dirname, `semantic_suggestions_${type}.json`);
  let suggestions = [];
  console.log(`\n[${type.toUpperCase()}] Taramasi basliyor... (${dataList.length} kayit)`);

  const BATCH_SIZE = 10;
  
  for (let i = 0; i < dataList.length; i += BATCH_SIZE) {
    const batchRaw = dataList.slice(i, i + BATCH_SIZE);
    // Index ekleyerek gonderelim ki hangisi bozuk anlayalim
    const batchData = batchRaw.map((v, idx) => ({ id_index: i + idx, ...v }));

    console.log(`  -> Batch [${i} to ${i + batchRaw.length - 1}] analiz ediliyor...`);
    try {
      const results = await callAi(batchData, type);
      
      const faulty = results.filter(r => r.ok === false);
      if (faulty.length > 0) {
        console.log(`     ⚠️ ${faulty.length} kayitta hata bulundu!`);
        faulty.forEach(f => {
          const original = batchData.find(b => b.id_index == f.id_index);
          suggestions.push({
            id_index: f.id_index,
            reason: f.reason,
            original: original,
            correction: f.correction || {}
          });
        });
      } else {
         console.log(`     ✅ Temiz.`);
      }

      fs.writeFileSync(REPORT_FILE, JSON.stringify(suggestions, null, 2), 'utf8');
      await new Promise(res => setTimeout(res, 2000)); // Rate limit
      
    } catch (e) {
      console.error(`     ❌ Hata: ${e.message}.`);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
  console.log(`[${type.toUpperCase()}] Bitti! Rapor: ${REPORT_FILE}`);
}

async function run() {
  const synData = loadData(path.join(__dirname, 'ydt-kelime-pratigi/src/data/curatedSynonyms.js'), 'CURATED_SYNONYMS');
  const phrData = loadData(path.join(__dirname, 'ydt-kelime-pratigi/src/data/curatedPhrasalVerbs.js'), 'CURATED_PHRASAL_VERBS');

  if (synData.length > 0) {
    await scanList('synonyms', synData);
  }
  if (phrData.length > 0) {
    await scanList('phrasal', phrData);
  }
}

run();
