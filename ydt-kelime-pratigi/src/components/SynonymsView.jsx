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
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim();

const buildBank = (words) => {
  const safeWords = Array.isArray(words) ? words : [];
  const bank = [];
  const seen = new Set();
  const byLevel = new Map();

  safeWords.forEach((w) => {
    if (!w?.term) return;
    const key = w.level || "B1";
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(w);
  });

  byLevel.forEach((levelWords, level) => {
    const tokenMap = new Map();
    // Yuksek veri setlerinde UI kilitlenmesini onlemek icin seviye basi limit
    levelWords.slice(0, 1800).forEach((w) => {
      const raw = `${w.meaning || ""},${w.hint || ""},${w.example || ""}`;
      raw.split(/[\s,.;:!?()/-]+/g).forEach((part) => {
        const token = cleanToken(part);
        if (!token || token.length < 4 || STOP_WORDS.has(token)) return;
        if (!tokenMap.has(token)) tokenMap.set(token, []);
        tokenMap.get(token).push(w);
      });
    });

    tokenMap.forEach((tokenWords, token) => {
      if (tokenWords.length < 2) return;
      // O(n^2) yerine anchor tabanli iliski: cok daha hizli ve stabil
      const sample = tokenWords.slice(0, 10);
      const anchor = sample[0];
      for (let i = 1; i < sample.length; i += 1) {
        const b = sample[i];
        if (!anchor?.term || !b?.term || anchor.term === b.term) continue;
        const key1 = `${anchor.term}__${b.term}__${level}`;
        const key2 = `${b.term}__${anchor.term}__${level}`;
        if (!seen.has(key1)) {
          seen.add(key1);
          bank.push({ term: anchor.term, synonym: b.term, level, token });
        }
        if (!seen.has(key2)) {
          seen.add(key2);
          bank.push({ term: b.term, synonym: anchor.term, level, token });
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
    const distractors = (Array.isArray(words) ? words : [])
      .filter((w) => w.term !== question.term && w.term !== correct)
      .slice(0, 300)
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
      <h2>Es Anlamli Kelime Calismasi</h2>
      <p>
        Seviye sec, en yakin es anlami bul. Havuzda <strong>{filteredBank.length}</strong> es anlam iliskisi
        var.
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
        <div className="empty-state">Bu seviyede es anlam verisi bulunamadi.</div>
      ) : (
        <div className="syn-quiz-card">
          <h3>{question.term}</h3>
          <p>Bu kelimenin en yakin es anlamlisini sec:</p>
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
