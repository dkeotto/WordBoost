import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CURATED_SYNONYMS } from "../data/curatedSynonyms.js";
import { CURATED_PHRASAL_VERBS } from "../data/curatedPhrasalVerbs.js";

// ── localStorage-based favorites ───────────────────────────────────────────
const STORAGE_KEY = "sp_favorites_v1";
function loadFavs() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []); }
  catch (_) { return new Set(); }
}
function saveFavs(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])); } catch (_) { /**/ }
}

// ── constants ──────────────────────────────────────────────────────────────
const LEVELS = ["ALL", "A1", "A2", "B1", "B2", "C1", "C2"];
const MODES  = [
  { id: "words",    label: "🔤 Kelimeler", icon: "🔤" },
  { id: "synonyms", label: "🔁 Synonyms",  icon: "🔁" },
  { id: "phrasal",  label: "🧩 Phrasal",   icon: "🧩" },
];

// ── sentence templates (universal — work for any POS) ──────────────────────
const SENTENCE_TEMPLATES = [
  (w) => `She used the word "${w}" correctly in her essay.`,
  (w) => `The teacher asked: "Can you say the word ${w} out loud?"`,
  (w) => `He demonstrated how to use "${w}" in everyday speech.`,
  (w) => `Learning to pronounce "${w}" takes time and practice.`,
  (w) => `She confidently said "${w}" in front of the whole class.`,
  (w) => `The student smiled when she heard "${w}" for the first time.`,
  (w) => `He repeated "${w}" several times until it sounded natural.`,
  (w) => `Understanding "${w}" is an important step for English fluency.`,
];

function generateSentence(targetWord, existingExample) {
  // Prefer curated example if it looks like a real sentence (>15 chars, contains target)
  const ex = String(existingExample || "").trim();
  if (ex.length > 15) return ex;
  // Deterministic template selection based on word hash
  let hash = 0;
  for (let i = 0; i < targetWord.length; i++) hash = (hash * 31 + targetWord.charCodeAt(i)) >>> 0;
  return SENTENCE_TEMPLATES[hash % SENTENCE_TEMPLATES.length](targetWord);
}

// ── helpers ────────────────────────────────────────────────────────────────
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  return 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
}

const WORD_PASS  = 0.72;   // threshold for single word match
const SENT_PASS  = 0.55;   // content-word match ratio for sentence

/** Sentence matching: check if ≥55% of content words from target appear in spoken */
function sentenceMatch(spoken, sentence) {
  const spNorm   = normalize(spoken);
  const sentNorm = normalize(sentence);
  // Full similarity check first
  if (similarity(spoken, sentence) >= 0.62) return true;
  // Content word coverage
  const contentWords = sentNorm.split(" ").filter((w) => w.length > 3);
  if (contentWords.length === 0) return similarity(spoken, sentence) >= 0.50;
  const matched = contentWords.filter((w) => spNorm.includes(w)).length;
  return matched / contentWords.length >= SENT_PASS;
}

// ── TTS ────────────────────────────────────────────────────────────────────
function speakTextWithVoice(text, voiceURI, rate = 0.82) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = rate;
  if (voiceURI) {
    const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURI);
    if (v) u.voice = v;
  }
  window.speechSynthesis.speak(u);
}

// ── SpeechRecognition detection ────────────────────────────────────────────
const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

// ── build question pools ───────────────────────────────────────────────────
function buildWordsPool(words) {
  if (!Array.isArray(words) || words.length === 0) return [];
  return words
    .filter((w) => w && w.term)
    .map((w) => ({
      mode: "words",
      level: w.level || "B1",
      target: w.term,
      display: w.term,
      hint: w.meaning || "",
      example: w.example || "",
      phrase: w.hint || "",
      // keep full word obj for favorites
      _word: w,
    }));
}

function buildSynonymsPool() {
  return CURATED_SYNONYMS.map((q) => ({
    mode: "synonyms",
    level: q.level || "B1",
    target: q.correct,
    display: q.question,
    hint: `Synonym of "${q.question}"`,
    example: q.example || "",
    phrase: q.correct,
    _favKey: `${q.question}__${q.correct}__${q.level || "B1"}`,
  }));
}

function buildPhrasalPool() {
  return CURATED_PHRASAL_VERBS.map((q) => ({
    mode: "phrasal",
    level: q.level || "B1",
    target: q.correct,
    display: q.base,
    // meaning field doesn't exist in data → build a descriptive fallback
    hint: q.meaning || `"${q.correct}" — phrasal verb of "${q.base}"`,
    example: q.example || "",
    phrase: q.correct,
    _favKey: `${q.base}__${q.correct}__${q.level || "B1"}`,
  }));
}

// ── Mic wave animation ─────────────────────────────────────────────────────
const MicWave = ({ active }) => (
  <div className={`sp-mic-wave ${active ? "active" : ""}`} aria-hidden>
    {[0, 1, 2, 3, 4].map((i) => (
      <span key={i} className="sp-mic-bar" style={{ animationDelay: `${i * 0.12}s` }} />
    ))}
  </div>
);

// ── createRecognizer helper ─────────────────────────────────────────────────
/**
 * Creates a Web Speech API recognizer.
 * Uses `resultReceived` ref to distinguish "ended with result" vs "ended silently".
 */
function createRecognizer({ onSpoken, onError, resultReceivedRef, setListening, setIdle }) {
  if (!SR) return null;
  const rec = new SR();
  rec.lang = "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  rec.continuous = false;

  rec.onstart = () => setListening();

  rec.onresult = (e) => {
    resultReceivedRef.current = true;
    const results = e.results[0];
    let best = "", bestConf = -1;
    for (let i = 0; i < results.length; i++) {
      if (results[i].confidence > bestConf) { bestConf = results[i].confidence; best = results[i].transcript; }
    }
    onSpoken(best.trim());
  };

  rec.onerror = (e) => {
    resultReceivedRef.current = true; // prevent onend from overwriting
    if (e.error === "not-allowed" || e.error === "permission-denied") {
      onError("Mikrofon erişimi reddedildi. Tarayıcı ayarlarından izin ver.");
    } else if (e.error === "no-speech") {
      onError("Ses algılanamadı. Tekrar dene.");
    } else if (e.error === "network") {
      onError("Ağ hatası. İnternet bağlantını kontrol et.");
    } else if (e.error !== "aborted") {
      onError(`Tanıma hatası: ${e.error}`);
    }
    setIdle();
  };

  rec.onend = () => {
    // If onresult never fired (silent stop / timeout), reset to idle gracefully
    if (!resultReceivedRef.current) {
      setIdle();
    }
  };

  return rec;
}

// ── Voice Picker modal ─────────────────────────────────────────────────────
const VoicePicker = ({ voices, selectedURI, onSelect, onClose }) => (
  <div className="sp-voice-overlay" role="dialog" aria-modal="true" aria-label="Ses Seç" onClick={onClose}>
    <div className="sp-voice-modal" onClick={(e) => e.stopPropagation()}>
      <div className="sp-voice-modal-header">
        <span>🔊 Ses Seç</span>
        <button className="sp-voice-close" onClick={onClose} aria-label="Kapat">✕</button>
      </div>
      <p className="sp-voice-hint">Cümleyi okuyacak sesi seçin:</p>
      <div className="sp-voice-list">
        <button
          className={`sp-voice-item ${!selectedURI ? "active" : ""}`}
          onClick={() => onSelect(null)}
        >
          <span className="sp-voice-name">🤖 Varsayılan Ses</span>
          <span className="sp-voice-lang">en-US</span>
        </button>
        {voices.map((v) => (
          <button
            key={v.voiceURI}
            className={`sp-voice-item ${selectedURI === v.voiceURI ? "active" : ""}`}
            onClick={() => onSelect(v.voiceURI)}
          >
            <span className="sp-voice-name">{v.name}</span>
            <span className="sp-voice-lang">{v.lang}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// ── Sentence Practice Panel ────────────────────────────────────────────────
const SentencePanel = ({
  sentence, onVoicePickerOpen, onCancel, onSpeak,
  sentStatus, sentFeedback, sentSpoken, onMicClick, onRetry,
}) => (
  <div className="sp-sentence-panel">
    <div className="sp-sentence-header">
      <span className="sp-sentence-title">💬 Cümle Pratiği</span>
      <button className="sp-sentence-cancel" onClick={onCancel} aria-label="Cümle pratiğini kapat">
        ✕ İptal
      </button>
    </div>

    <div className="sp-sentence-text">&ldquo;{sentence}&rdquo;</div>

    <div className="sp-sentence-tts-row">
      <button className="sp-sentence-tts-btn" onClick={onSpeak} aria-label="Cümleyi sesli dinle">
        🔊 Dinle
      </button>
      <button className="sp-voice-pick-btn" onClick={onVoicePickerOpen} aria-label="TTS sesi seç">
        🎛️ Ses Seç
      </button>
    </div>

    <div className="sp-mic-section" style={{ marginTop: "0.5rem" }}>
      <MicWave active={sentStatus === "listening"} />
      <button
        id="sp-sent-mic-btn"
        className={`sp-mic-btn sp-sent-mic-btn ${sentStatus === "listening" ? "sp-mic-btn--active" : ""}`}
        onClick={onMicClick}
        disabled={sentStatus === "processing" || sentStatus === "correct"}
        aria-label={sentStatus === "listening" ? "Kaydı durdur" : "Cümleyi söyle"}
      >
        {sentStatus === "idle"       && "🎙️ Cümleyi Söyle"}
        {sentStatus === "listening"  && "⏹ Durdur"}
        {sentStatus === "processing" && "⏳ İşleniyor…"}
        {sentStatus === "correct"    && "✅ Harika!"}
        {sentStatus === "wrong"      && "🔁 Tekrar Dene"}
      </button>
      {sentStatus === "listening" && (
        <p className="sp-listening-hint">Cümleyi söyleyin… bitince durdurabilirsiniz</p>
      )}
    </div>

    {(sentStatus === "correct" || sentStatus === "wrong") && (
      <div className={`sp-result ${sentStatus === "correct" ? "sp-result--correct" : "sp-result--wrong"}`}>
        <p className="sp-result-text">{sentFeedback}</p>
        {sentSpoken && (
          <p className="sp-spoken">
            <span className="sp-spoken-label">Söylediğiniz:</span> &ldquo;{sentSpoken}&rdquo;
          </p>
        )}
        {sentStatus === "wrong" && (
          <button className="sp-sentence-retry" onClick={onRetry}>🔁 Tekrar Dene</button>
        )}
      </div>
    )}
  </div>
);

// ══════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════
const SpeakingView = ({
  words = [],
  playSound,
  onTrackAnswer,
  // Favorites props are optional (gracefully ignored if not passed)
  favorites: _favsUnused,
  toggleWordFavorite: _twf,
  toggleSynFavorite: _tsf,
  togglePhrasalFavorite: _tpf,
}) => {
  // ── Core state ──────────────────────────────────────────────────────────
  const [mode, setMode]     = useState("words");
  const [level, setLevel]   = useState("ALL");
  const [idx, setIdx]       = useState(0);
  const [score, setScore]   = useState({ correct: 0, wrong: 0 });
  const [poolReady, setPoolReady] = useState(false);
  const [allPool, setAllPool]     = useState([]);

  // ── Word recognition state ───────────────────────────────────────────────
  const [wordStatus, setWordStatus]     = useState("idle");
  const [wordSpoken, setWordSpoken]     = useState("");
  const [wordFeedback, setWordFeedback] = useState("");
  const [wordMicErr, setWordMicErr]     = useState("");

  // ── Sentence panel state ─────────────────────────────────────────────────
  const [sentOpen, setSentOpen]         = useState(false);
  const [sentence, setSentence]         = useState("");
  const [sentStatus, setSentStatus]     = useState("idle");
  const [sentSpoken, setSentSpoken]     = useState("");
  const [sentFeedback, setSentFeedback] = useState("");

  // ── Voice ────────────────────────────────────────────────────────────────
  const [voices, setVoices]                   = useState([]);
  const [selectedVoice, setSelectedVoice]     = useState(null);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);

  // ── Favorites (localStorage) ─────────────────────────────────────────────
  const [favKeys, setFavKeys] = useState(() => loadFavs());

  // ── Browser support ──────────────────────────────────────────────────────
  const [browserOk, setBrowserOk] = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const wordRecRef       = useRef(null);     // word recognition instance
  const sentRecRef       = useRef(null);     // sentence recognition instance
  const wordResultRef    = useRef(false);    // did word rec get a result?
  const sentResultRef    = useRef(false);    // did sentence rec get a result?
  const advanceTimer     = useRef(null);

  // ── Stop helpers (safe, no-throw) ────────────────────────────────────────
  const stopWordRec = useCallback(() => {
    try { wordRecRef.current?.abort(); } catch (_) { /**/ }
    wordRecRef.current = null;
  }, []);

  const stopSentRec = useCallback(() => {
    try { sentRecRef.current?.abort(); } catch (_) { /**/ }
    sentRecRef.current = null;
  }, []);

  // ── Load voices ──────────────────────────────────────────────────────────
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis?.getVoices() || [];
      setVoices(v.filter((x) => x.lang.startsWith("en")));
    };
    load();
    window.speechSynthesis?.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener("voiceschanged", load);
  }, []);

  // ── Feature detect ───────────────────────────────────────────────────────
  useEffect(() => { if (!SR) setBrowserOk(false); }, []);

  // ── Build pool ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPoolReady(false);
    const t = setTimeout(() => {
      if (cancelled) return;
      const pool = [
        ...buildWordsPool(words),
        ...buildSynonymsPool(),
        ...buildPhrasalPool(),
      ];
      if (!cancelled) { setAllPool(pool); setPoolReady(true); }
    }, 30);
    return () => { cancelled = true; clearTimeout(t); };
  }, [words]);

  // ── Computed pool ────────────────────────────────────────────────────────
  const pool = useMemo(() => {
    if (!poolReady) return [];
    const filtered = allPool.filter(
      (q) => q.mode === mode && (level === "ALL" || q.level === level)
    );
    return shuffle(filtered);
  }, [allPool, poolReady, mode, level]);

  const question   = pool.length > 0 ? pool[idx % pool.length] : null;
  const questionNo = pool.length > 0 ? (idx % pool.length) + 1 : 0;
  const progress   = pool.length > 0 ? Math.round(questionNo / pool.length * 100) : 0;

  // ── Favorites computed ───────────────────────────────────────────────────
  const isFavorite = useMemo(() => {
    if (!question) return false;
    return favKeys.has(question._favKey || question.target);
  }, [question, favKeys]);

  const handleToggleFav = useCallback(() => {
    if (!question) return;
    const key = question._favKey || question.target;
    setFavKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveFavs(next);
      return next;
    });
  }, [question]);

  // ── Reset on mode/level/pool change ─────────────────────────────────────
  useEffect(() => {
    setIdx(0);
    setWordStatus("idle"); setWordSpoken(""); setWordFeedback(""); setWordMicErr("");
    setSentOpen(false); setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
    stopWordRec(); stopSentRec();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, [mode, level, poolReady, stopWordRec, stopSentRec]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => () => {
    stopWordRec(); stopSentRec();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    window.speechSynthesis?.cancel();
  }, [stopWordRec, stopSentRec]);

  // ── advance ──────────────────────────────────────────────────────────────
  const advance = useCallback(() => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    stopWordRec(); stopSentRec();
    setWordStatus("idle"); setWordSpoken(""); setWordFeedback(""); setWordMicErr("");
    setSentOpen(false); setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
    setIdx((i) => i + 1);
  }, [stopWordRec, stopSentRec]);

  // ── Evaluate word ────────────────────────────────────────────────────────
  const evaluateWord = useCallback((spoken) => {
    if (!question) return;
    const sim          = similarity(spoken, question.target);
    const targetTokens = normalize(question.target).split(" ");
    const spNorm       = normalize(spoken);
    const allFound     = targetTokens.length > 1 && targetTokens.every((t) => spNorm.includes(t));
    const isCorrect    = sim >= WORD_PASS || allFound;

    setWordSpoken(spoken);
    setWordStatus(isCorrect ? "correct" : "wrong");
    setWordFeedback(
      isCorrect
        ? "🎉 Harika! Doğru söyledin!"
        : `❌ "${spoken || "(ses algılanamadı)"}" — Doğrusu: "${question.target}"`
    );
    if (isCorrect) { setScore((s) => ({ ...s, correct: s.correct + 1 })); playSound?.("correct"); }
    else           { setScore((s) => ({ ...s, wrong:   s.wrong   + 1 })); playSound?.("wrong"); }
    onTrackAnswer?.("speaking", isCorrect, question.level || "ALL");
    if (isCorrect) advanceTimer.current = setTimeout(advance, 1500);
  }, [question, playSound, onTrackAnswer, advance]);

  // ── Evaluate sentence ────────────────────────────────────────────────────
  const evaluateSentence = useCallback((spoken) => {
    const isCorrect = sentenceMatch(spoken, sentence);
    setSentSpoken(spoken);
    setSentStatus(isCorrect ? "correct" : "wrong");
    setSentFeedback(
      isCorrect
        ? "🎉 Mükemmel! Cümleyi doğru söyledin!"
        : `❌ "${spoken || "(ses algılanamadı)"}" — Cümleyi dikkatlice dinleyip tekrar deneyin.`
    );
    playSound?.(isCorrect ? "correct" : "wrong");
  }, [sentence, playSound]);

  // ── Start word recognition ───────────────────────────────────────────────
  const startWordRec = useCallback(() => {
    if (!SR || !question) return;
    setWordMicErr(""); setWordSpoken(""); setWordFeedback("");
    stopWordRec();
    wordResultRef.current = false;

    const rec = createRecognizer({
      onSpoken:          (t) => { setWordStatus("processing"); evaluateWord(t); },
      onError:           (msg) => setWordMicErr(msg),
      resultReceivedRef: wordResultRef,
      setListening:      () => setWordStatus("listening"),
      setIdle:           () => setWordStatus("idle"),
    });
    if (!rec) return;
    wordRecRef.current = rec;
    try { rec.start(); } catch (err) { setWordMicErr("Mikrofon başlatılamadı: " + err.message); }
  }, [question, stopWordRec, evaluateWord]);

  // ── Start sentence recognition ───────────────────────────────────────────
  const startSentRec = useCallback(() => {
    if (!SR) return;
    setSentSpoken(""); setSentFeedback("");
    stopSentRec();
    sentResultRef.current = false;

    const rec = createRecognizer({
      onSpoken:          (t) => { setSentStatus("processing"); evaluateSentence(t); },
      onError:           (msg) => { setSentStatus("idle"); setSentFeedback("⚠️ " + msg); },
      resultReceivedRef: sentResultRef,
      setListening:      () => setSentStatus("listening"),
      setIdle:           () => setSentStatus("idle"),
    });
    if (!rec) return;
    sentRecRef.current = rec;
    try { rec.start(); } catch (err) { setSentStatus("idle"); setSentFeedback("⚠️ Mikrofon başlatılamadı: " + err.message); }
  }, [stopSentRec, evaluateSentence]);

  // ── Button handlers ──────────────────────────────────────────────────────
  const handleWordMicClick = () => {
    if (wordStatus === "listening") { stopWordRec(); setWordStatus("idle"); }
    else if (wordStatus === "idle" || wordStatus === "wrong") startWordRec();
  };

  const handleSentMicClick = () => {
    if (sentStatus === "listening") { stopSentRec(); setSentStatus("idle"); }
    else if (sentStatus === "idle" || sentStatus === "wrong") startSentRec();
  };

  const handleSpeak = () => speakTextWithVoice(question?.target || "", selectedVoice, 0.78);

  const handleOpenSentence = () => {
    if (!question) return;
    stopWordRec();
    setSentence(generateSentence(question.target, question.example));
    setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
    setSentOpen(true);
  };

  const handleCancelSentence = () => {
    stopSentRec();
    setSentOpen(false);
    setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
  };

  const handleSentenceSpeak = () => speakTextWithVoice(sentence, selectedVoice, 0.78);

  const handleSentenceRetry = () => {
    setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
  };

  const handleVoiceSelect = (uri) => { setSelectedVoice(uri); setVoicePickerOpen(false); };

  const handlePrev = () => {
    stopWordRec(); stopSentRec();
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setIdx((i) => Math.max(0, i - 1));
    setWordStatus("idle"); setWordSpoken(""); setWordFeedback(""); setWordMicErr("");
    setSentOpen(false); setSentStatus("idle"); setSentSpoken(""); setSentFeedback("");
  };

  // ── Unsupported browser ──────────────────────────────────────────────────
  if (!browserOk) {
    return (
      <div className="synonyms-view">
        <div className="sp-unsupported">
          <div className="sp-unsupported-icon">🌐</div>
          <h2>Speaking desteklenmiyor</h2>
          <p>Bu özellik <strong>Google Chrome</strong> veya <strong>Microsoft Edge</strong> tarayıcısında çalışır.</p>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="synonyms-view sp-view">

      {/* Voice Picker Modal */}
      {voicePickerOpen && (
        <VoicePicker
          voices={voices}
          selectedURI={selectedVoice}
          onSelect={handleVoiceSelect}
          onClose={() => setVoicePickerOpen(false)}
        />
      )}

      {/* Header */}
      <div className="syn-header sp-header">
        <div className="sp-header-icon">🎙️</div>
        <h2>Speaking Pratiği</h2>
        <p>Kelime veya ifadeyi sesli söyle — telaffuzun değerlendirilsin</p>
      </div>

      {/* Mode Tabs */}
      <div className="sp-mode-tabs">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`sp-mode-tab ${mode === m.id ? "active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Controls Row */}
      <div className="syn-controls" style={!poolReady ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
        <label>Seviye:</label>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          {LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
        </select>
        <div className="syn-score">
          <span>✅ Doğru: {score.correct}</span>
          <span>❌ Yanlış: {score.wrong}</span>
        </div>
      </div>

      {/* Progress */}
      <div className="syn-progress">
        <div className="syn-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Loading */}
      {!poolReady && <div className="empty-state" role="status">Sorular hazırlanıyor…</div>}

      {/* Empty pool */}
      {poolReady && pool.length === 0 && <div className="empty-state">Bu seviyede soru bulunamadı.</div>}

      {/* Main Quiz Card */}
      {poolReady && pool.length > 0 && question && (
        <div className={`syn-quiz-card sp-card${wordStatus === "correct" ? " sp-card--correct" : wordStatus === "wrong" ? " sp-card--wrong" : ""}`}>

          {/* Meta row */}
          <div className="syn-meta">
            <span className="syn-level-badge">{question.level}</span>
            <span className="syn-qno">Soru {questionNo}/{pool.length}</span>
            <span className="sp-mode-badge">{MODES.find((m) => m.id === mode)?.icon} {mode}</span>
          </div>

          {/* Prompt */}
          <div className="sp-prompt-section">
            <p className="sp-prompt-label">
              {mode === "words"    && "Bu kelimeyi söyle:"}
              {mode === "synonyms" && "Bu kelimenin eş anlamlısını söyle:"}
              {mode === "phrasal"  && "Bu fiilin phrasal verb'ünü söyle:"}
            </p>

            {/* Word + TTS + Favorite */}
            <div className="sp-word-display">
              <span className="sp-word">{question.display}</span>
              <button
                className="sp-tts-btn"
                onClick={handleSpeak}
                title="Doğru telaffuzu dinle"
                aria-label="Doğru telaffuzu dinle"
              >
                🔊
              </button>
              {/* Favorite button */}
              <button
                className={`sp-fav-btn${isFavorite ? " sp-fav-btn--active" : ""}`}
                onClick={handleToggleFav}
                title={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                aria-label={isFavorite ? "Favorilerden çıkar" : "Favorilere ekle"}
              >
                {isFavorite ? "⭐" : "☆"}
              </button>
            </div>

            {/* Target hint for synonyms/phrasal */}
            {(mode === "synonyms" || mode === "phrasal") && (
              <div className="sp-target-hint">
                <span>Hedef ifade: </span><strong>{question.phrase}</strong>
              </div>
            )}
          </div>

          {/* Info section */}
          <div className="sp-info-section">
            {question.hint && (
              <p className="sp-info-row">
                <span className="sp-info-label">📖 Anlam:</span>
                <span>{question.hint}</span>
              </p>
            )}
            {question.example && (
              <p className="sp-info-row">
                <span className="sp-info-label">💬 Örnek:</span>
                <span className="sp-example">{question.example}</span>
              </p>
            )}
          </div>

          {/* ── Sentence Trigger / Panel ── */}
          {sentOpen ? (
            <SentencePanel
              sentence={sentence}
              onVoicePickerOpen={() => setVoicePickerOpen(true)}
              onCancel={handleCancelSentence}
              onSpeak={handleSentenceSpeak}
              sentStatus={sentStatus}
              sentFeedback={sentFeedback}
              sentSpoken={sentSpoken}
              onMicClick={handleSentMicClick}
              onRetry={handleSentenceRetry}
            />
          ) : (
            <button
              className="sp-sentence-trigger"
              onClick={handleOpenSentence}
              title="Bu kelimeyle örnek cümle oluştur ve telaffuz pratği yap"
            >
              ✍️ Bu kelime ile cümle oluştur
            </button>
          )}

          {/* ── Word Mic Section (hidden while sentence panel is open) ── */}
          {!sentOpen && (
            <>
              <div className="sp-mic-section">
                <MicWave active={wordStatus === "listening"} />
                <button
                  id="sp-mic-btn"
                  className={`sp-mic-btn${wordStatus === "listening" ? " sp-mic-btn--active" : ""}${["correct", "wrong"].includes(wordStatus) ? " sp-mic-btn--done" : ""}`}
                  onClick={handleWordMicClick}
                  disabled={wordStatus === "processing" || wordStatus === "correct"}
                  aria-label={wordStatus === "listening" ? "Kaydı durdur" : "Telaffuzu söyle"}
                >
                  {wordStatus === "idle"       && "🎙️ Söyle"}
                  {wordStatus === "listening"  && "⏹ Durdur"}
                  {wordStatus === "processing" && "⏳ İşleniyor…"}
                  {wordStatus === "correct"    && "✅ Doğru!"}
                  {wordStatus === "wrong"      && "🔁 Tekrar Dene"}
                </button>
                {wordStatus === "listening" && (
                  <p className="sp-listening-hint">Söylüyorsunuz… bekleniyor</p>
                )}
              </div>

              {wordMicErr && <div className="sp-mic-error" role="alert">⚠️ {wordMicErr}</div>}

              {(wordStatus === "correct" || wordStatus === "wrong") && (
                <div className={`sp-result${wordStatus === "correct" ? " sp-result--correct" : " sp-result--wrong"}`}>
                  <p className="sp-result-text">{wordFeedback}</p>
                  {wordSpoken && (
                    <p className="sp-spoken">
                      <span className="sp-spoken-label">Söylediğiniz:</span> &ldquo;{wordSpoken}&rdquo;
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Navigation */}
          <div className="syn-nav-buttons">
            <button className="syn-prev-btn" onClick={handlePrev} disabled={idx === 0}>
              ← Önceki
            </button>
            <button className="syn-next-btn" onClick={advance}>
              Sonraki →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeakingView;
