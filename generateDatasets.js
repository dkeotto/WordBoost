require('dotenv').config();
const fs = require('fs');
const path = require('path');

const ALIEN_KEYS = [
  process.env.GROQ_API_KEY_1 || "",
  process.env.GROQ_API_KEY_2 || "" 
].filter(Boolean);
let keyIndex = 0;

function getApiKey() {
   const k = ALIEN_KEYS[keyIndex % ALIEN_KEYS.length];
   keyIndex++;
   return k;
}

const BATCH_SIZE = 25;

async function callAi(type, existingKeysList) {
  const isSynonym = type === 'synonyms';
  const apiKey = getApiKey();
  
  const existingWordsStr = existingKeysList.join(', ');

  const prompt = `Sen Ingilizce ve Turkce dillerine tam hakim, C2 akademik duzeyde bir dilbilimci ve Ozel Ingilizce Sinav (YDT/TOEFL) sorusu hazirlayan profesorsundur. 

Gorevin: Bana YDT ve YDS seviyesine uygun, daha once sormadigin yepyeni ${BATCH_SIZE} adet ${isSynonym ? 'Eş Anlamlı Kelimeler (Synonyms)' : 'Deyimsel Fiiller (Phrasal Verbs)'} sorusu uretmektir.

DIKKAT: Daha once su kelimeleri URETTIN. Bunlari veya bunlara cok benzeyenleri ASLA uretme:
[ ${existingWordsStr} ]

Uretilecek JSON Objeleri Icerigi:
${isSynonym ? '- question: Sorulan ana kelime (ornek: abandon)\n- correct: Dogru es anlamlisi (ornek: leave)\n- options: 4 adet sik (icinde correct olan kelime mutlaka var, diger ucu farkli ve gramer olarak uyumlu celdiriciler olsun)' : '- base: Ana fiil (ornek: look)\n- correct: Dogru phrasal verb (ornek: look after)\n- options: 4 adet sik (icinde correct olan phrasal verb mutlaka var, diger 3 u gramer uyumlu celdiriciler)'}
- level: CEFR Zorluk seviyesi (A1, A2, B1, B2, C1, C2). Gercek sinav seviyelerine (Genelde B1-C1) uygun, sinavda cikmasi muhtemel olanlari sec.

Kurallar:
1. "options" dizisinde tam olarak 4 sIk olmalidir ve bu 4 sIktaki kelimelerin arasinda dogru cevap OLMALIDIR. 
2. Diger 3 yanlis sIk celdirici olmalidir ama ana soru kelimesiyle zit anlama filan da gelebilir, gramer olarak sacmalamamalidir.
3. Tum phrasal verbler yepyeni olmali ve daha once sorduklarinin icinde OLMAMALIDIR.

Cikti SADECE STRICT JSON FORMATINDA OLMALIDIR!

Format:
{
  "data": [
    {
      "level": "seviye",
      ${isSynonym ? '"question": "...",' : '"base": "...",'}
      "correct": "...",
      "options": ["...", "...", "...", "..."]
    }
  ]
}
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
      messages: [{ role: 'system', content: 'You are an API that outputs strictly JSON. Output an object with a "data" array.' }, { role: 'user', content: prompt }],
      temperature: 0.5 // Biraz cesitlilik icin hafif artirdik ama cok delirtmemek lazim.
    })
  });

  const raw = await resp.json();
  if (raw.error) throw new Error(raw.error.message || JSON.stringify(raw.error));

  const text = raw.choices && raw.choices[0] ? raw.choices[0].message.content : '';
  try {
    const parsed = JSON.parse(text);
    return parsed.data || [];
  } catch (e) {
    console.warn("AI JSON donmedi. Ham cikti:", text);
    throw new Error("Invalid format from AI");
  }
}

function loadFile(filePath, exportName) {
  const content = fs.readFileSync(filePath, 'utf8');
  const arrayString = content.replace(`export const ${exportName} =`, '').trim().replace(/;$/, '');
  try {
    return eval(`(${arrayString})`); 
  } catch (e) {
    console.error(`Dosya parse edilemedi: ${filePath}`);
    return [];
  }
}

function saveFile(filePath, exportName, dataArray) {
  const newJsContent = `export const ${exportName} = ${JSON.stringify(dataArray, null, 2)};\n`;
  fs.writeFileSync(filePath, newJsContent, 'utf8');
}

async function generatorLoop(type, filePath, exportName, TARGET_AMOUNT) {
  const isSynonym = type === 'synonyms';
  let list = loadFile(filePath, exportName);

  console.log(`\n===========================================`);
  console.log(`[${type.toUpperCase()}] Yeni Veri Uretimi Basliyor`);
  console.log(`Mevcut Kayit: ${list.length} | Hedef: ${TARGET_AMOUNT}`);

  while (list.length < TARGET_AMOUNT) {
    // Toplam var olan basliklari (base veya question) filtrele ki yapay zeka tekrar uretmesin
    const existingKeys = Array.from(new Set(list.map(i => isSynonym ? i.question : i.correct)));

    console.log(`  -> API Cagrisi yapiliyor... Bakiye: ${TARGET_AMOUNT - list.length}`);
    try {
      const generated = await callAi(type, existingKeys);
      
      let added = 0;
      let rejected = 0;
      
      for (const item of generated) {
        if (!item.level || !item.correct || !item.options || item.options.length !== 4) {
           rejected++; continue;
        }
        const key = isSynonym ? item.question : item.correct;
        if (!key || existingKeys.includes(key)) {
           rejected++; continue; // Kopya uretti, cope at.
        }

        // Temiz ise listeye ekle
        list.push(item);
        added++;
        existingKeys.push(key);
        
        if (list.length >= TARGET_AMOUNT) break;
      }

      console.log(`  ✅ ${added} adet yepyeni benzersiz soru eklendi! (Kopya/Hatali sayisi: ${rejected})`);
      console.log(`     Toplam ${list.length} / ${TARGET_AMOUNT}`);

      // Her batch sonrasi guvenli yedekleme
      saveFile(filePath, exportName, list);

      await new Promise(res => setTimeout(res, 3000)); // Rate limit bekleyisi

    } catch (e) {
      console.error(`  ❌ Hata: ${e.message}`);
      await new Promise(res => setTimeout(res, 5000));
    }
  }

  console.log(`🎉 [${type.toUpperCase()}] HEDEFE ULASILDI! TASTAMAM ${list.length} ADET KAYIT DOSYAYA YAZILDI.`);
}

async function run() {
  const synFile = path.join(__dirname, 'ydt-kelime-pratigi/src/data/curatedSynonyms.js');
  const phrFile = path.join(__dirname, 'ydt-kelime-pratigi/src/data/curatedPhrasalVerbs.js');

  await generatorLoop('synonyms', synFile, 'CURATED_SYNONYMS', 700);
  await generatorLoop('phrasal', phrFile, 'CURATED_PHRASAL_VERBS', 500);

  console.log(`\n🚀 BUYUK OPERASYON TAMAMLANDI! Tum listeler 500 hedefine ulasmistir.`);
}

run();
