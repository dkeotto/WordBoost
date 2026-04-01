import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildPhrasalQuestionPool } from "../utils/questionGenerators";

const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  const str = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shuffleSeeded(arr, seed) {
  const out = [...arr];
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
const RECENT_LIMIT = 50;
const keyOf = (q) => `${q?.level || "ALL"}__${q?.base || ""}__${q?.correct || ""}`;

const PhrasalVerbsView = ({ playSound, onTrackAnswer, words }) => {
  const [level, setLevel] = useState("ALL");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [recentKeys, setRecentKeys] = useState([]);
  const autoNextTimer = useRef(null);
  const [allQuestions, setAllQuestions] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const t0 = setTimeout(() => {
      if (!cancelled) setAllQuestions(null);
    }, 0);
    const t = setTimeout(() => {
      try {
        const pool = buildPhrasalQuestionPool(words);
        if (!cancelled) setAllQuestions(pool);
      } catch {
        if (!cancelled) setAllQuestions([]);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [words]);

  useEffect(() => {
    if (Array.isArray(allQuestions)) {
      const t = setTimeout(() => {
        setIndex(0);
        setSelected("");
        setIsLocked(false);
        setRecentKeys([]);
      }, 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [allQuestions]);

  const filtered = useMemo(() => {
    if (!allQuestions || allQuestions.length === 0) return [];
    return level === "ALL" ? allQuestions : allQuestions.filter((item) => item.level === level);
  }, [allQuestions, level]);

  const randomizedPool = useMemo(() => shuffleSeeded(filtered, hashStr(filtered.map((q) => q.correct).join("|"))), [filtered]);

  const question = randomizedPool[index % Math.max(1, randomizedPool.length)];
  const questionNo = (index % Math.max(1, randomizedPool.length)) + 1;
  const total = Math.max(1, randomizedPool.length);
  const progress = Math.round((questionNo / total) * 100);
  const recentSet = useMemo(() => new Set(recentKeys), [recentKeys]);
  const options = useMemo(() => {
    if (!question) return [];
    const list = [...(question.options || [])];
    const uniq = Array.from(new Set(list)).slice(0, 4);
    return shuffleSeeded(uniq, hashStr(`${question.correct}__${index}`));
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
        next();
      }, 650);
    } else {
      setIsLocked(false);
    }
  };

  const next = () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
    if (!randomizedPool || randomizedPool.length === 0) return;
    const len = randomizedPool.length;
    const currentKey = keyOf(question);
    setRecentKeys((prev) => [...prev, currentKey].slice(-RECENT_LIMIT));
    setSelected("");
    setIsLocked(false);
    let nextIndex = index;
    for (let tries = 0; tries < len; tries += 1) {
      nextIndex = (nextIndex + 1) % len;
      const candidate = randomizedPool[nextIndex];
      const k = keyOf(candidate);
      if (len <= RECENT_LIMIT || !recentSet.has(k) || tries === len - 1) break;
    }
    setIndex(nextIndex);
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
          Seviye seç, doğru phrasal verb seçeneğini bul. Havuzda{" "}
          <strong>{allQuestions === null ? "…" : randomizedPool.length}</strong> soru var.
        </p>
      </div>

      {allQuestions === null && (
        <div className="empty-state" role="status">
          Sorular hazırlanıyor… (büyük havuz bir kez oluşturuluyor, lütfen bekle)
        </div>
      )}

      <div
        className="syn-controls"
        style={allQuestions === null ? { opacity: 0.5, pointerEvents: "none" } : undefined}
      >
        <label>Seviye:</label>
        <select
          value={level}
          onChange={(e) => {
            setLevel(e.target.value);
            setIndex(0);
            setSelected("");
            setRecentKeys([]);
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

      {allQuestions !== null && randomizedPool.length === 0 && (
        <div className="empty-state">Bu seviyede phrasal verb verisi bulunamadı.</div>
      )}

      {allQuestions !== null && randomizedPool.length > 0 && (
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
