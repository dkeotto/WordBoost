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
  /** Ana thread’i kilitlememek için üretim üst sınırı (havuz yine curated+gold ile dolu kalır) */
  const MAX_GENERATED_SYN = 2800;
  const wrongPool = shuffle(allTerms.filter(Boolean));
  let wrongCursor = 0;
  const pickWrong = (exclude1, exclude2) => {
    const out = [];
    const ex = new Set([exclude1, exclude2]);
    for (let k = 0; k < wrongPool.length && out.length < 3; k++) {
      const t = wrongPool[(wrongCursor + k) % wrongPool.length];
      if (!ex.has(t)) out.push(t);
    }
    wrongCursor += 1;
    return out;
  };

  for (const [token, list] of byMeaningToken) {
    if (generated.length >= MAX_GENERATED_SYN) break;
    if (!list || list.length < 2) continue;
    const sample = shuffle(list).slice(0, 14);
    for (let i = 0; i < sample.length && generated.length < MAX_GENERATED_SYN; i += 1) {
      for (let j = 0; j < sample.length && generated.length < MAX_GENERATED_SYN; j += 1) {
        if (i === j) continue;
        const a = sample[i];
        const b = sample[j];
        if (!a?.term || !b?.term || a.term === b.term) continue;
        const key = `${a.term}__${b.term}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const wrong = pickWrong(a.term, b.term);
        for (let pad = 0; wrong.length < 3 && pad < 30; pad += 1) {
          const w = `${a.term}_${pad}`;
          if (w !== b.term && !wrong.includes(w)) wrong.push(w);
        }
        generated.push({
          level: a.level || "B1",
          question: a.term,
          correct: b.term,
          options: shuffle([b.term, ...wrong.slice(0, 3)]),
          hint: token,
          meaning: a.meaning || "",
          example: a.example || "",
          source: "generated",
        });
      }
    }
  }

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
    .slice(0, 450);

  const generated = [];
  const seen = new Set();
  const MAX_GENERATED_PHR = 3200;
  baseWords.forEach((base, idx) => {
    if (generated.length >= MAX_GENERATED_PHR) return;
    const lv = LEVELS[idx % LEVELS.length];
    PHRASAL_PARTICLES.forEach((p, pIdx) => {
      if (generated.length >= MAX_GENERATED_PHR) return;
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

