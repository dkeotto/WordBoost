import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = join(__dirname, "../words.js");
const s = fs.readFileSync(p, "utf8");
const re =
  /\{\s*term:\s*"([^"]+)"\s*,\s*meaning:\s*"([^"]*)"\s*,\s*hint:\s*"([^"]*)"\s*,\s*example:\s*"([^"]*)"/g;
const tr = /[çğıöşüÇĞİÖŞÜâîûô]/;
const trSuffix =
  /(mak|mek|malı|meli|mış|miş|muş|müş|dır|dir|dur|dür|lar|ler|yor|yorum|yorsun|yoruz|ıyor|iyor|uuyor|üyor|ın|in|un|ün|ız|iz|uz|üz|ım|im|um|üm|ken|dı|di|du|dü|tı|ti|tu|tü|sa|se|mış|miş|muş|müş|lık|lik|luk|lük|sız|siz|suz|süz)$/i;

let m;
const out = [];
while ((m = re.exec(s))) {
  const [, term, meaning, hint] = m;
  if (!meaning || meaning.length > 40) continue;
  if (tr.test(meaning)) continue;
  if (trSuffix.test(meaning)) continue;
  if (/^[a-z]/.test(meaning)) continue;
  if (meaning.includes(",") || meaning.includes(";")) continue;
  if (meaning.length < 2 || meaning.length > 22) continue;
  if (!/^[A-Z][a-z]+$/.test(meaning)) continue;
  out.push({ term, meaning });
}
out.sort((a, b) => a.term.localeCompare(b.term));
console.log("count", out.length);
for (const r of out) console.log(`${r.term}\t${r.meaning}`);
