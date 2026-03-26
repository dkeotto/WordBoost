import React, { useMemo, useState } from "react";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];
const STOP_WORDS = new Set([
  "ve",
  "ile",
  "bir",
  "bu",
  "that",
  "the",
  "for",
  "from",
  "to",
  "of",
  "an",
  "or",
  "as",
  "in",
  "on",
  "by",
  "at",
  "olmak",
  "etmek",
  "yapmak",
  "birsey",
  "something",
  "someone",
]);

const cleanToken = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-zA-Z0-9cCgGiIoOsSuU]/g, "")
    .trim();

const buildBank = (words) => {
  const bank = [];
  const seen = new Set();
  const byLevel = new Map();

  words.forEach((w) => {
    const key = w.level || "B1";
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(w);
  });

  byLevel.forEach((levelWords, level) => {
    const tokenMap = new Map();
    levelWords.forEach((w) => {
      const raw = `${w.meaning || ""},${w.hint || ""},${w.example || ""}`;
      raw.split(/[\s,.;:!?()/-]+/g).forEach((part) => {
        const token = cleanToken(part);
        if (!token || token.length < 4 || STOP_WORDS.has(token)) return;
        if (!tokenMap.has(token)) tokenMap.set(token, []);
        tokenMap.get(token).push(w);
      });
    });

    tokenMap.forEach((tokenWords) => {
      if (tokenWords.length < 2) return;
      const sample = tokenWords.slice(0, 35);
      for (let i = 0; i < sample.length; i += 1) {
        for (let j = 0; j < sample.length; j += 1) {
          if (i === j) continue;
          const a = sample[i];
          const b = sample[j];
          if (!a?.term || !b?.term || a.term === b.term) continue;
          const key = `${a.term}__${b.term}`;
          if (seen.has(key)) continue;
          seen.add(key);
          bank.push({
            term: a.term,
            synonym: b.term,
            level,
            token,
          });
        }
      }
    });
  });

  return bank;
};

const SynonymsView = ({ words }) => {
  const [level, setLevel] = useState("ALL");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  const synonymBank = useMemo(() => buildBank(words), [words]);

  const filteredBank = useMemo(() => {
    if (level === "ALL") return synonymBank;
    return synonymBank.filter((item) => item.level === level);
  }, [synonymBank, level]);

  const termsWithSynonyms = useMemo(() => {
    const map = new Map();
    filteredBank.forEach((item) => {
      if (!map.has(item.term)) map.set(item.term, []);
      map.get(item.term).push(item.synonym);
    });
    return map;
  }, [filteredBank]);

  const questionPool = useMemo(() => {
    return Array.from(termsWithSynonyms.entries()).map(([term, syns]) => ({
      term,
      synonyms: Array.from(new Set(syns)),
    }));
  }, [termsWithSynonyms]);

  const question = questionPool[questionIndex % Math.max(1, questionPool.length)];
  const correct = question?.synonyms?.[0] || "";

  const options = useMemo(() => {
    if (!question || !correct) return [];
    const distractors = words
      .filter((w) => w.term !== question.term && w.term !== correct)
      .slice(0, 200)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((w) => w.term);

    return [correct, ...distractors].sort(() => Math.random() - 0.5);
  }, [question, correct, words, questionIndex]);

  const answer = (value) => {
    if (!question || selected) return;
    setSelected(value);
    if (value === correct) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  };

  const next = () => {
    setSelected("");
    setQuestionIndex((i) => i + 1);
  };

  return (
    <div className="synonyms-view">
      <h2>Synonyms Calisma</h2>
      <p>
        Seviye sec, yakin anlamli kelimeyi bul. Havuzda <strong>{filteredBank.length}</strong> synonym
        iliskisi var.
      </p>

      <div className="syn-controls">
        <label>Seviye:</label>
        <select value={level} onChange={(e) => {
          setLevel(e.target.value);
          setQuestionIndex(0);
          setSelected("");
        }}>
          {LEVELS.map((lv) => (
            <option key={lv} value={lv}>{lv}</option>
          ))}
        </select>
        <div className="syn-score">
          <span>Dogru: {score.correct}</span>
          <span>Yanlis: {score.wrong}</span>
        </div>
      </div>

      {questionPool.length === 0 ? (
        <div className="empty-state">Bu seviyede synonym verisi bulunamadi.</div>
      ) : (
        <div className="syn-quiz-card">
          <h3>{question.term}</h3>
          <p>Bu kelimeye en yakin anlami sec:</p>
          <div className="syn-options">
            {options.map((opt) => (
              <button
                key={opt}
                className={`syn-option ${selected ? (opt === correct ? "correct" : opt === selected ? "wrong" : "") : ""}`}
                onClick={() => answer(opt)}
                disabled={Boolean(selected)}
              >
                {opt}
              </button>
            ))}
          </div>
          {selected && (
            <div className="syn-result">
              {selected === correct ? "Harika! Dogru cevap." : `Dogru cevap: ${correct}`}
            </div>
          )}
          <button className="syn-next-btn" onClick={next}>Sonraki Soru</button>
        </div>
      )}
    </div>
  );
};

export default SynonymsView;
