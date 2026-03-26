const LEVELS = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const validateGoldEntry = (entry, type) => {
  const errors = [];
  if (!entry || typeof entry !== "object") {
    return ["Entry object olmalı."];
  }

  if (!entry.id) errors.push("id zorunlu.");
  if (!LEVELS.has(entry.level)) errors.push("level A1-C2 aralığında olmalı.");
  if (!entry.status) errors.push("status zorunlu.");
  if (!["approved", "review", "rejected"].includes(entry.status)) {
    errors.push("status approved/review/rejected olmalı.");
  }

  if (type === "synonyms") {
    if (!entry.question) errors.push("question zorunlu.");
    if (!entry.correct) errors.push("correct zorunlu.");
    if (!Array.isArray(entry.options) || entry.options.length < 4) {
      errors.push("options en az 4 şık olmalı.");
    }
  }

  if (type === "phrasal") {
    if (!entry.base) errors.push("base zorunlu.");
    if (!entry.correct) errors.push("correct zorunlu.");
    if (!Array.isArray(entry.options) || entry.options.length < 4) {
      errors.push("options en az 4 şık olmalı.");
    }
  }

  return errors;
};

export const validateGoldDataset = (dataset, type) => {
  const list = Array.isArray(dataset) ? dataset : [];
  const report = {
    total: list.length,
    approved: 0,
    review: 0,
    rejected: 0,
    invalid: 0,
    invalidEntries: [],
    byLevel: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
  };

  list.forEach((entry) => {
    const errs = validateGoldEntry(entry, type);
    if (errs.length > 0) {
      report.invalid += 1;
      report.invalidEntries.push({ id: entry?.id || "no-id", errors: errs });
      return;
    }
    if (report.byLevel[entry.level] !== undefined) report.byLevel[entry.level] += 1;
    report[entry.status] += 1;
  });

  return report;
};

export const getApprovedGoldEntries = (dataset) =>
  (Array.isArray(dataset) ? dataset : []).filter((q) => q?.status === "approved");

export const getGoldReviewQueue = (dataset) =>
  (Array.isArray(dataset) ? dataset : []).filter((q) => q?.status === "review");

