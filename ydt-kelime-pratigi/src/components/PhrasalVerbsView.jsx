import React, { useMemo, useRef, useState } from "react";
import { buildPhrasalQuestionPool } from "../utils/questionGenerators";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];

const PhrasalVerbsView = ({ playSound, onTrackAnswer, words }) => {
  const [level, setLevel] = useState("ALL");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const autoNextTimer = useRef(null);

  const allQuestions = useMemo(() => buildPhrasalQuestionPool(words), [words]);
  const filtered = useMemo(
    () => (level === "ALL" ? allQuestions : allQuestions.filter((item) => item.level === level)),
    [allQuestions, level]
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
    if (!question || selected || isLocked) return;
    setIsLocked(true);
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
    if (isCorrect) {
      autoNextTimer.current = setTimeout(() => {
        setSelected("");
        setIndex((i) => i + 1);
        setIsLocked(false);
      }, 650);
    } else {
      setIsLocked(false);
    }
  };

  const next = () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    setSelected("");
    setIndex((i) => i + 1);
    setIsLocked(false);
  };

  const prev = () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    setSelected("");
    setIndex((i) => Math.max(0, i - 1));
    setIsLocked(false);
  };

  return (
    <div className="synonyms-view">
      <div className="syn-header">
        <h2>Phrasal Verbs Çalışması</h2>
        <p>
          Seviye seç, doğru phrasal verb seçeneğini bul. Havuzda <strong>{filtered.length}</strong> soru var.
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
          {question.meaning && <p className="syn-sub">Not: {question.meaning}</p>}
          {question.example && <p className="syn-sub">Örnek: {question.example}</p>}
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
          <div className="syn-nav-buttons">
            <button className="syn-prev-btn" onClick={prev} disabled={index === 0}>Önceki Soru</button>
            <button className="syn-next-btn" onClick={next}>Sonraki Soru</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PhrasalVerbsView;
