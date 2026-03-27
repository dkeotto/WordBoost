import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const p = join(__dirname, "../words.js");
const s = fs.readFileSync(p, "utf8");
const re = /\{\s*term:\s*"([^"]+)"\s*,\s*meaning:\s*"([^"]*)"/g;
const tr = /[çğıöşüÇĞİÖŞÜ]/;
const bad = [];
let m;
while ((m = re.exec(s))) {
  const term = m[1];
  const meaning = m[2];
  if (!meaning || meaning.length > 80) continue;
  if (tr.test(meaning)) continue;
  if (/^[a-z]/.test(meaning)) continue;
  if (/^[0-9]/.test(meaning)) continue;
  if (meaning.includes(",")) continue;
  if (meaning.length < 2 || meaning.length > 28) continue;
  if (/^[A-Z][a-z]+$/.test(meaning)) bad.push({ term, meaning });
}
console.log("Count:", bad.length);
console.log(bad.slice(0, 120).map((x) => `${x.term} => ${x.meaning}`).join("\n"));
