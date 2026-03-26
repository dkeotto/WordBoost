import { CURATED_SYNONYMS } from "../data/curatedSynonyms.js";
import { CURATED_PHRASAL_VERBS } from "../data/curatedPhrasalVerbs.js";
import { GOLD_DATASET } from "../data/goldDataset.js";
import { getApprovedGoldEntries } from "./goldDatasetPipeline.js";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const PHRASAL_PARTICLES = ["up", "down", "out", "in", "on", "off", "over", "away", "back", "through"];

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const normalize = (v) => String(v || "").toLowerCase().trim();

export const buildSynonymQuestionPool = (words) => {
  const safe = Array.isArray(words) ? words : [];
  const byMeaningToken = new Map();
  const allTerms = safe.map((w) => w.term).filter(Boolean);

  safe.forEach((w) => {
    const tokens = String(w.meaning || "")
      .split(/[,\s/]+/g)
      .map((t) => t.toLowerCase().trim())
      .filter((t) => t.length >= 4);
    const uniq = new Set(tokens);
    uniq.forEach((t) => {
      if (!byMeaningToken.has(t)) byMeaningToken.set(t, []);
      byMeaningToken.get(t).push(w);
    });
  });

  const generated = [];
  const seen = new Set();
  byMeaningToken.forEach((list, token) => {
    if (!list || list.length < 2) return;
    const sample = shuffle(list).slice(0, 18);
    for (let i = 0; i < sample.length; i += 1) {
      for (let j = 0; j < sample.length; j += 1) {
        if (i === j) continue;
        const a = sample[i];
        const b = sample[j];
        if (!a?.term || !b?.term || a.term === b.term) continue;
        const key = `${a.term}__${b.term}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const wrong = shuffle(allTerms.filter((t) => t !== a.term && t !== b.term)).slice(0, 3);
        generated.push({
          level: a.level || "B1",
          question: a.term,
          correct: b.term,
          options: shuffle([b.term, ...wrong]),
          hint: token,
          meaning: a.meaning || "",
          example: a.example || "",
          source: "generated",
        });
      }
    }
  });

  const goldApproved = getApprovedGoldEntries(GOLD_DATASET.synonyms).map((q) => ({ ...q, source: "gold" }));
  const curated = CURATED_SYNONYMS.map((q) => ({ ...q, source: "curated" }));
  const merged = [...goldApproved, ...curated, ...generated].filter((q) => q.options?.length >= 4);
  return merged.length >= 1000 ? merged : [...merged, ...shuffle(merged)].slice(0, 1200);
};

export const buildPhrasalQuestionPool = (words) => {
  const safe = Array.isArray(words) ? words : [];
  const termSet = new Set(safe.map((w) => normalize(w.term)));
  const baseWords = safe
    .map((w) => normalize(w.term))
    .filter((t) => t && !t.includes(" ") && t.length >= 3)
    .slice(0, 600);

  const generated = [];
  const seen = new Set();
  baseWords.forEach((base, idx) => {
    const lv = LEVELS[idx % LEVELS.length];
    PHRASAL_PARTICLES.forEach((p, pIdx) => {
      const correct = `${base} ${p}`;
      const key = `${correct}__${lv}`;
      if (seen.has(key)) return;
      seen.add(key);
      const wrongParticles = PHRASAL_PARTICLES.filter((x) => x !== p).slice(pIdx % 4, (pIdx % 4) + 3);
      const options = shuffle([correct, ...wrongParticles.map((wp) => `${base} ${wp}`)]);
      generated.push({
        level: lv,
        base,
        correct,
        options,
        meaning: termSet.has(correct) ? "Sözlükte bulunan phrasal form." : "Bağlama göre anlam kazanan phrasal yapı.",
        example: `Example: We ${correct} the task quickly.`,
        source: "generated",
      });
    });
  });

  const goldApproved = getApprovedGoldEntries(GOLD_DATASET.phrasal).map((q) => ({ ...q, source: "gold" }));
  const curated = CURATED_PHRASAL_VERBS.map((q) => ({ ...q, source: "curated" }));
  const merged = [...goldApproved, ...curated, ...generated];
  return merged.length >= 1000 ? merged : [...merged, ...shuffle(merged)].slice(0, 1200);
};

