import { CURATED_SYNONYMS } from "./curatedSynonyms.js";
import { CURATED_PHRASAL_VERBS } from "./curatedPhrasalVerbs.js";

const toGoldMeta = (items, type) =>
  items.map((item, idx) => ({
    ...item,
    id: `${type}-${idx + 1}`,
    status: "approved",
    reviewer: "editorial-v1",
    qualityScore: 0.95,
    lastReviewedAt: "2026-03-26",
  }));

export const GOLD_DATASET = {
  synonyms: toGoldMeta(CURATED_SYNONYMS, "syn"),
  phrasal: toGoldMeta(CURATED_PHRASAL_VERBS, "phr"),
};

