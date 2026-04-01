function guardAiPromptLogging(v) {
  const s = String(v ?? "");
  return s
    .replace(/bearer\s+[a-z0-9\-\._]+/gi, "bearer ***")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "***@***")
    .slice(0, 12000);
}

module.exports = { guardAiPromptLogging };

