import React, { useMemo, useState } from "react";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];

const PARTICLES = [
  "up",
  "down",
  "out",
  "in",
  "on",
  "off",
  "over",
  "away",
  "back",
  "through",
  "around",
  "about",
  "into",
];

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildPhrasalBank = (words) => {
  const list = Array.isArray(words) ? words : [];
  const result = [];
  const seen = new Set();

  const byLevel = new Map();
  list.forEach((w) => {
    if (!w?.term) return;
    const lv = w.level || "B1";
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv).push(w);
  });

  byLevel.forEach((levelWords, level) => {
    const dictionary = new Set(levelWords.map((w) => normalize(w.term)));
    const levelLimit = levelWords.slice(0, 2200);

    levelLimit.forEach((w) => {
      const base = normalize(w.term);
      if (!base || base.includes(" ")) return;
      if (base.length < 3) return;

      const candidates = [
        `${base} up`,
        `${base} out`,
        `${base} off`,
        `${base} on`,
        `${base} down`,
        `${base} back`,
        `${base} in`,
      ];

      let chosen = candidates.find((c) => dictionary.has(c));

      if (!chosen) {
        const tokenText = normalize(`${w.meaning} ${w.hint} ${w.example}`);
        const hintedParticle = PARTICLES.find((p) => tokenText.includes(` ${p} `));
        if (hintedParticle) chosen = `${base} ${hintedParticle}`;
      }

      if (!chosen) return;
      const key = `${chosen}__${level}`;
      if (seen.has(key)) return;
      seen.add(key);

      const distractors = levelWords
        .filter((x) => x?.term && normalize(x.term) !== chosen)
        .slice(0, 140)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((x) => x.term);

      result.push({
        base: w.term,
        phrasal: chosen,
        level,
        distractors,
      });
    });
  });

  return result.slice(0, 5000);
};

const PhrasalVerbsView = ({ words }) => {
  const [level, setLevel] = useState("ALL");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  const bank = useMemo(() => buildPhrasalBank(words), [words]);
  const filtered = useMemo(
    () => (level === "ALL" ? bank : bank.filter((item) => item.level === level)),
    [bank, level]
  );

  const question = filtered[index % Math.max(1, filtered.length)];
  const options = useMemo(() => {
    if (!question) return [];
    const list = [question.phrasal, ...(question.distractors || [])];
    return Array.from(new Set(list)).slice(0, 4).sort(() => Math.random() - 0.5);
  }, [question, index]);

  const answer = (value) => {
    if (!question || selected) return;
    setSelected(value);
    if (value === question.phrasal) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const next = () => {
    setSelected("");
    setIndex((i) => i + 1);
  };

  return (
    <div className="synonyms-view">
      <h2>Phrasal Verbs Calismasi</h2>
      <p>
        Seviye sec, uygun phrasal verb secenegini bul. Havuzda <strong>{filtered.length}</strong> alistirma var.
      </p>

      <div className="syn-controls">
        <label>Seviye:</label>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setIndex(0);
            setSelected("");
          }}
        >
          {LEVELS.map((lv) => (
            <option key={lv} value={lv}>
              {lv}
            </option>
          ))}
        </select>
        <div className="syn-score">
          <span>Dogru: {score.correct}</span>
          <span>Yanlis: {score.wrong}</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">Bu seviyede phrasal verb verisi bulunamadi.</div>
      ) : (
        <div className="syn-quiz-card">
          <h3>Base Verb: {question.base}</h3>
          <p>Dogru phrasal verb secenegini sec:</p>
          <div className="syn-options">
            {options.map((opt) => (
              <button
                key={opt}
                className={`syn-option ${
                  selected ? (opt === question.phrasal ? "correct" : opt === selected ? "wrong" : "") : ""
                }`}
                onClick={() => answer(opt)}
                disabled={Boolean(selected)}
              >
                {opt}
              </button>
            ))}
          </div>
          {selected && (
            <div className="syn-result">
              {selected === question.phrasal ? "Harika! Dogru cevap." : `Dogru cevap: ${question.phrasal}`}
            </div>
          )}
          <button className="syn-next-btn" onClick={next}>
            Sonraki Soru
          </button>
        </div>
      )}
    </div>
  );
};

export default PhrasalVerbsView;
