import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildSynonymQuestionPool } from "../utils/questionGenerators";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];

const SynonymsView = ({ playSound, onTrackAnswer, words }) => {
  const [level, setLevel] = useState("ALL");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const autoNextTimer = useRef(null);
  /** null = havuz üretiliyor (büyük havuz senkron üretilince UI donmasın) */
  const [allQuestions, setAllQuestions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setAllQuestions(null);
    const t = setTimeout(() => {
      try {
        const pool = buildSynonymQuestionPool(words);
        if (!cancelled) setAllQuestions(pool);
      } catch {
        if (!cancelled) setAllQuestions([]);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [words]);

  useEffect(() => {
    if (Array.isArray(allQuestions)) {
      setQuestionIndex(0);
      setSelected("");
      setIsLocked(false);
    }
  }, [allQuestions]);

  const questionPool = useMemo(() => {
    if (!allQuestions || allQuestions.length === 0) return [];
    if (level === "ALL") return allQuestions;
    return allQuestions.filter((item) => item.level === level);
  }, [allQuestions, level]);

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
    if (!question || selected || isLocked) return;
    setIsLocked(true);
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
    if (isCorrect) {
      autoNextTimer.current = setTimeout(() => {
        setSelected("");
        setQuestionIndex((i) => i + 1);
        setIsLocked(false);
      }, 650);
    } else {
      setIsLocked(false);
    }
  };

  const next = () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    setSelected("");
    setQuestionIndex((i) => i + 1);
    setIsLocked(false);
  };

  const prev = () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    setSelected("");
    setQuestionIndex((i) => Math.max(0, i - 1));
    setIsLocked(false);
  };

  return (
    <div className="synonyms-view">
      <div className="syn-header">
        <h2>Eş Anlamlı Kelime Çalışması</h2>
        <p>
          Seviye seç, en uygun eş anlamı bul. Havuzda{" "}
          <strong>{allQuestions === null ? "…" : questionPool.length}</strong> soru
          var.
        </p>
      </div>

      {allQuestions === null && (
        <div className="empty-state" role="status">
          Sorular hazırlanıyor… (büyük havuz bir kez oluşturuluyor, lütfen bekle)
        </div>
      )}

      <div className="syn-controls" style={allQuestions === null ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
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

      {allQuestions !== null && questionPool.length === 0 && (
        <div className="empty-state">Bu seviyede eş anlam verisi bulunamadı.</div>
      )}

      {allQuestions !== null && questionPool.length > 0 && (
        <div className="syn-quiz-card">
          <div className="syn-meta">
            <span className="syn-level-badge">{question.level}</span>
            <span className="syn-qno">Soru {questionNo}/{total}</span>
          </div>
          <h3>{question.question}</h3>
          <p>Bu kelimenin en yakın eş anlamlısını seç:</p>
          {question.meaning && <p className="syn-sub">Anlam: {question.meaning}</p>}
          {question.example && <p className="syn-sub">Örnek: {question.example}</p>}
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
          <div className="syn-nav-buttons">
            <button className="syn-prev-btn" onClick={prev} disabled={questionIndex === 0}>Önceki Soru</button>
            <button className="syn-next-btn" onClick={next}>Sonraki Soru</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SynonymsView;
