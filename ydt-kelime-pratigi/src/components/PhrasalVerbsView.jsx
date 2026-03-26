import React, { useMemo, useState } from "react";
import { CURATED_PHRASAL_VERBS } from "../data/curatedPhrasalVerbs";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];

const PhrasalVerbsView = ({ playSound, onTrackAnswer }) => {
  const [level, setLevel] = useState("ALL");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  const filtered = useMemo(
    () => (level === "ALL" ? CURATED_PHRASAL_VERBS : CURATED_PHRASAL_VERBS.filter((item) => item.level === level)),
    [level]
  );

  const question = filtered[index % Math.max(1, filtered.length)];
  const questionNo = (index % Math.max(1, filtered.length)) + 1;
  const total = Math.max(1, filtered.length);
  const progress = Math.round((questionNo / total) * 100);
  const options = useMemo(() => {
    if (!question) return [];
    const list = [...(question.options || [])];
    return Array.from(new Set(list)).slice(0, 4).sort(() => Math.random() - 0.5);
  }, [question, index]);

  const answer = (value) => {
    if (!question || selected) return;
    setSelected(value);
    const isCorrect = value === question.correct;
    if (isCorrect) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      if (playSound) playSound("correct");
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      if (playSound) playSound("wrong");
    }
    if (onTrackAnswer) {
      onTrackAnswer("phrasal", isCorrect, question.level || "ALL");
    }
  };

  const next = () => {
    setSelected("");
    setIndex((i) => i + 1);
  };

  return (
    <div className="synonyms-view">
      <div className="syn-header">
        <h2>Phrasal Verbs Çalışması</h2>
        <p>
          Seviye seç, doğru phrasal verb seçeneğini bul. Havuzda <strong>{filtered.length}</strong> alıştırma var.
        </p>
      </div>

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
          <span>✅ Doğru: {score.correct}</span>
          <span>❌ Yanlış: {score.wrong}</span>
        </div>
      </div>
      <div className="syn-progress">
        <div className="syn-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">Bu seviyede phrasal verb verisi bulunamadı.</div>
      ) : (
        <div className="syn-quiz-card">
          <div className="syn-meta">
            <span className="syn-level-badge">{question.level}</span>
            <span className="syn-qno">Soru {questionNo}/{total}</span>
          </div>
          <h3>Base Verb: {question.base}</h3>
          <p>Doğru phrasal verb seçeneğini seç:</p>
          <div className="syn-options">
            {options.map((opt) => (
              <button
                key={opt}
                className={`syn-option ${
                  selected ? (opt === question.correct ? "correct" : opt === selected ? "wrong" : "") : ""
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
              {selected === question.correct ? "Harika! Doğru cevap." : `Doğru cevap: ${question.correct}`}
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
