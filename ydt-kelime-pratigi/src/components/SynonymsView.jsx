import React, { useMemo, useState } from "react";
import { CURATED_SYNONYMS } from "../data/curatedSynonyms";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];

const SynonymsView = ({ playSound, onTrackAnswer }) => {
  const [level, setLevel] = useState("ALL");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  const questionPool = useMemo(() => {
    if (level === "ALL") return CURATED_SYNONYMS;
    return CURATED_SYNONYMS.filter((item) => item.level === level);
  }, [level]);

  const question = questionPool[questionIndex % Math.max(1, questionPool.length)];
  const correct = question?.correct || "";
  const questionNo = (questionIndex % Math.max(1, questionPool.length)) + 1;
  const total = Math.max(1, questionPool.length);
  const progress = Math.round((questionNo / total) * 100);

  const options = useMemo(() => {
    if (!question) return [];
    return [...question.options];
  }, [question]);

  const answer = (value) => {
    if (!question || selected) return;
    setSelected(value);
    const isCorrect = value === correct;
    if (isCorrect) {
      setScore((s) => ({ ...s, correct: s.correct + 1 }));
      if (playSound) playSound("correct");
    } else {
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
      if (playSound) playSound("wrong");
    }
    if (onTrackAnswer) {
      onTrackAnswer("synonyms", isCorrect, question.level || "ALL");
    }
  };

  const next = () => {
    setSelected("");
    setQuestionIndex((i) => i + 1);
  };

  return (
    <div className="synonyms-view">
      <div className="syn-header">
        <h2>Eş Anlamlı Kelime Çalışması</h2>
        <p>
          Seviye seç, en uygun eş anlamı bul. Manuel curated havuzda <strong>{questionPool.length}</strong> soru
          var.
        </p>
      </div>

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
          <span>✅ Doğru: {score.correct}</span>
          <span>❌ Yanlış: {score.wrong}</span>
        </div>
      </div>
      <div className="syn-progress">
        <div className="syn-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {questionPool.length === 0 ? (
        <div className="empty-state">Bu seviyede eş anlam verisi bulunamadı.</div>
      ) : (
        <div className="syn-quiz-card">
          <div className="syn-meta">
            <span className="syn-level-badge">{question.level}</span>
            <span className="syn-qno">Soru {questionNo}/{total}</span>
          </div>
          <h3>{question.question}</h3>
          <p>Bu kelimenin en yakın eş anlamlısını seç:</p>
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
              {selected === correct ? "Harika! Doğru cevap." : `Doğru cevap: ${correct}`}
            </div>
          )}
          <button className="syn-next-btn" onClick={next}>Sonraki Soru</button>
        </div>
      )}
    </div>
  );
};

export default SynonymsView;
