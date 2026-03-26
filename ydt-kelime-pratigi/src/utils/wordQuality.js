const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

const TERM_FIXES = {
  accomodate: "accommodate",
  agressive: "aggressive",
  definately: "definitely",
  goverment: "government",
  independant: "independent",
  occured: "occurred",
  priviledge: "privilege",
  recieve: "receive",
  responsability: "responsibility",
  seperate: "separate",
  succesful: "successful",
  untill: "until",
};

const normalizeText = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

const scoreWord = (word) => {
  let score = 0;
  if (word.meaning) score += Math.min(word.meaning.length, 80);
  if (word.hint) score += Math.min(word.hint.length, 50);
  if (word.example) score += Math.min(word.example.length, 70);
  return score;
};

export const sanitizeWordList = (rawWords) => {
  const input = Array.isArray(rawWords) ? rawWords : [];
  const map = new Map();

  for (const item of input) {
    if (!item) continue;
    const originalTerm = normalizeText(item.term);
    if (!originalTerm) continue;

    const termKeyRaw = originalTerm.toLowerCase();
    const fixedTerm = TERM_FIXES[termKeyRaw] || termKeyRaw;

    const word = {
      term: fixedTerm,
      meaning: normalizeText(item.meaning),
      hint: normalizeText(item.hint),
      example: normalizeText(item.example),
      level: LEVELS.has(item.level) ? item.level : "B1",
    };

    if (!word.meaning) continue;

    const prev = map.get(word.term);
    if (!prev || scoreWord(word) > scoreWord(prev)) {
      map.set(word.term, word);
    }
  }

  return Array.from(map.values());
};

