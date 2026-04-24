import { useState, useEffect, useMemo, useRef, lazy, Suspense, Component } from "react";
import LoginModal from "./components/LoginModal";
const AdminPanel = lazy(() => import("./components/AdminPanel"));
import Navbar from "./components/Navbar";
import Flashcard from "./components/Flashcard";
import StatsPanel from "./components/StatsPanel";
import AvatarBuilder from "./components/AvatarBuilder";
import ConsentBanner from "./components/ConsentBanner";
import PricingModal from "./components/PricingModal";
import StartupScreen from "./components/StartupScreen";

const DashboardView = lazy(() => import("./components/DashboardView"));
const SynonymsView = lazy(() => import("./components/SynonymsView"));
const PhrasalVerbsView = lazy(() => import("./components/PhrasalVerbsView"));
const AiWritingView = lazy(() => import("./components/AiWritingView"));
const AiChatView = lazy(() => import("./components/AiChatView"));
const ClassroomView = lazy(() => import("./components/ClassroomView"));
const PricingPage = lazy(() => import("./components/PricingPage"));
const TermsPage = lazy(() => import("./components/TermsPage"));
const PrivacyPage = lazy(() => import("./components/PrivacyPage"));
const SiteInfoPage = lazy(() => import("./components/SiteInfoPage"));
const DrawRevealGame = lazy(() => import("./components/DrawRevealGame"));
const SpeakingView = lazy(() => import("./components/SpeakingView"));
import AdSlot from "./components/AdSlot";
import { sanitizeWordList } from "./utils/wordQuality";
import { readResponseJson } from "./utils/httpJson";
import { apiUrl } from "./utils/apiUrl";
import { formatPremiumUntilTr, isUserPremium } from "./utils/premiumDisplay";
import { buildSynonymQuestionPool, buildPhrasalQuestionPool } from "./utils/questionGenerators";
import { io } from "socket.io-client";
import "./App.css";


/** Production’da API Vercel proxy ile aynı origin; Socket.io ise Railway’e doğrudan (VITE_SOCKET_URL). */
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function readSiteInfoTabFromUrl() {
  if (typeof window === "undefined") return "features";
  const h = window.location.hash.replace(/^#/, "").toLowerCase();
  if (["features", "about", "privacy", "terms"].includes(h)) return h;
  return "features";
}

function readInitialViewFromUrl() {
  if (typeof window === "undefined") return "practice";
  const p = window.location.pathname.replace(/\/$/, "") || "/";
  if (p === "/pricing") return "pricing";
  if (p === "/terms") return "terms";
  if (p === "/privacy") return "privacy";
  if (p === "/bilgi" || p === "/info") return "site-info";
  if (p === "/draw" || p === "/resim") return "draw-reveal";
  if (p === "/classroom") return "classroom";
  const h = window.location.hash.replace("#", "").toLowerCase();
  if (h === "admin") return "admin";
  return "practice";
}

// BADGE CONSTANTS (Backend ile aynı olmalı)
const BADGES = {
  newbie: { id: 'newbie', icon: '🐣', name: 'Yeni Başlayan', desc: 'Aramıza hoş geldin!' },
  streak_3: { id: 'streak_3', icon: '🔥', name: '3 Günlük Seri', desc: '3 gün üst üste çalıştın!' },
  streak_7: { id: 'streak_7', icon: '⚡', name: 'Haftalık Seri', desc: '7 gün üst üste çalıştın!' },
  streak_30: { id: 'streak_30', icon: '🚀', name: 'Aylık Seri', desc: '30 gün üst üste çalıştın! İnanılmaz!' },
  known_100: { id: 'known_100', icon: '🧠', name: 'Kelime Avcısı', desc: '100 kelime öğrendin!' },
  known_500: { id: 'known_500', icon: '🎓', name: 'Kelime Ustası', desc: '500 kelime öğrendin!' },
  known_1000: { id: 'known_1000', icon: '👑', name: 'Kelime Kralı', desc: '1000 kelime öğrendin!' },
  night_owl: { id: 'night_owl', icon: '🦉', name: 'Gece Kuşu', desc: 'Gece 00:00 - 05:00 arası çalıştın.' },
  early_bird: { id: 'early_bird', icon: '🌅', name: 'Erkenci Kuş', desc: 'Sabah 05:00 - 09:00 arası çalıştın.' },
  weekend_warrior: { id: 'weekend_warrior', icon: '🎉', name: 'Hafta Sonu Savaşçısı', desc: 'Hafta sonu çalışmayı ihmal etmedin.' },
  painter: { id: 'painter', icon: '🎨', name: 'Ressam', desc: 'İlk tablono tamamlayarak sanata olan ilgini gösterdin!' }
};

const socket = io(SOCKET_URL, {
  path: "/socket.io/",
  transports: ["websocket", "polling"],
  timeout: 15000,
  reconnectionAttempts: 8,
  reconnectionDelay: 1000,
});

socket.io.on('upgradeError', (err) => {
  console.warn('Socket.IO upgrade error:', err);
});


let audioCtx;

const playSound = (type) => {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'correct') {
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    } else {
      oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(150, audioCtx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.4);
    }
  } catch (e) {
    console.log('Ses çalınamadı:', e);
  }
};

const generateOptions = (correctWord, allWords) => {
  const options = [correctWord];
  const otherWords = allWords.filter(w => w.term !== correctWord.term);
  const usedIndices = new Set();
  
  while (options.length < 4 && usedIndices.size < otherWords.length) {
    const randomIndex = Math.floor(Math.random() * otherWords.length);
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex);
      const wrongWord = otherWords[randomIndex];
      if (!(options || []).find(o => o.term === wrongWord.term)) {
        options.push(wrongWord);
      }
    }
  }
  
  while (options.length < 4) {
    options.push(correctWord);
  }
  
  return options.sort(() => Math.random() - 0.5);
};

const speakWord = (word) => {
    const utterance = new SpeechSynthesisUtterance(word.term);
    utterance.lang = 'en-US';
    utterance.rate = 0.8; 
    window.speechSynthesis.cancel(); 
    window.speechSynthesis.speak(utterance);
};

/**
 * Çalışma ve Test sayfaları için reklam layout'u.
 * PC (≥1024px): sol + sağ sidebar reklamlar
 * Tablet (768-1023px): sağ sidebar + içerik altı
 * Mobil (<768px): içerik altında banner
 */

// --- DIAGNOSTIC HELPERS ---
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("WordBoost Critical Crash:", error, info);
    // Auto-refresh for Vite chunk load errors (deploy issues)
    if (error && error.message && (/Failed to fetch dynamically imported module/i.test(error.message) || /Importing a module script failed/i.test(error.message))) {
      const hasReloaded = sessionStorage.getItem('wb_chunk_retry');
      if (!hasReloaded) {
        sessionStorage.setItem('wb_chunk_retry', 'true');
        window.location.reload();
        return;
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "50px", color: "white", background: "black", minHeight: "100vh", textAlign: "center" }}>
          <h1 style={{ color: "#FF9F1C" }}>Ups! Bir hata oluştu.</h1>
          <p>{this.state.error?.message || "Bilinmeyen bir hata."}</p>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", marginTop: "20px" }}>Yenile</button>
          <pre style={{ textAlign: "left", opacity: 0.5, margin: "20px auto", maxWidth: "800px", overflow: "auto" }}>
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const PageWithAds = ({ children, slotLeft, slotRight, slotBottom, isPremium }) => {
  const adsClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const hasLeft   = Boolean(adsClient && slotLeft);
  const hasRight  = Boolean(adsClient && slotRight);
  const hasBottom = Boolean(adsClient && slotBottom);

  if (isPremium) {
    return (
      <div className="page-with-ads">
        <div className="pwa-content">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="page-with-ads">
      {/* Sol sidebar — sadece PC'de görünür (CSS ile) */}
      {hasLeft && (
        <aside className="pwa-sidebar pwa-sidebar--left" aria-hidden="true">
          <AdSlot slot={slotLeft} format="vertical" className="ad-slot ad-sidebar-vert" isPremium={isPremium} />
        </aside>
      )}

      {/* Ana içerik */}
      <div className="pwa-content">
        {children}

        {/* Tablet ve mobil alt banner */}
        {hasBottom && (
          <div className="pwa-bottom-ad">
            <AdSlot slot={slotBottom} format="auto" className="ad-slot ad-inline" isPremium={isPremium} />
          </div>
        )}
      </div>

      {/* Sağ sidebar — PC ve tablette görünür (CSS ile) */}
      {hasRight && (
        <aside className="pwa-sidebar pwa-sidebar--right" aria-hidden="true">
          <AdSlot slot={slotRight} format="vertical" className="ad-slot ad-sidebar-vert" isPremium={isPremium} />
        </aside>
      )}
    </div>
  );
};

const PracticeView = ({ 
    isInRoom, stats, users, roomStats, username, 
    currentWordIndex, practiceWords, currentWord, 
    handleAnswer, buttonCooldown, prevWord, nextWord, 
    resetStats, setPracticeLevel, practiceLevel,
    isFlipped, flipCard, showHint, setShowHint, showExample, setShowExample, 
    feedback, feedbackMessage, favorites, toggleFavorite, speakWord,
    isHost, isAutoAdvance, setIsAutoAdvance
  }) => (
    <div className="practice">
      {isHost && isInRoom && (
         <div className="host-controls" style={{ marginBottom: "15px", padding: "10px", background: "rgba(255,255,255,0.05)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: "bold" }}>Tahta Kontrolü:</span>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
               <input type="checkbox" checked={isAutoAdvance} onChange={e => setIsAutoAdvance(e.target.checked)} />
               <span style={{ fontSize: "0.85rem" }}>Otomatik İlerlet (15sn)</span>
            </label>
            <button onClick={nextWord} style={{ padding: "5px 12px", fontSize: "0.8rem", background: "#1cb0f6" }}>Manuel Sonraki</button>
         </div>
      )}
      <h2>{isInRoom ? '👥 Yarış Modu' : 'Tek Kişilik Kelime Çalışması'}</h2>
      
      <StatsPanel stats={stats} resetStats={resetStats} isInRoom={isInRoom} practiceLevel={practiceLevel} setPracticeLevel={setPracticeLevel} />
      
      {isInRoom && (
        <div className="room-stats">
          <h3>🏆 Canlı Skor ({users.length} oyuncu)</h3>
          <div className="competitors">
            {Object.entries(roomStats).length === 0 ? (
              <p style={{color: 'rgba(255,255,255,0.5)'}}>Henüz skor yok...</p>
            ) : (
              Object.entries(roomStats)
                .sort(([,a], [,b]) => (b.known || 0) - (a.known || 0))
                .map(([name, userStats], index) => (
                  <div key={name} className={`competitor ${name === username ? 'me' : ''}`}>
                    <span className="rank">#{index + 1}</span>
                    <span className="name">{name} {name === username ? '(Sen)' : ''}</span>
                    <span className="score">✓ {userStats.known || 0}</span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
      
      <div className="progress">
        Kelime {currentWordIndex + 1} / {practiceWords.length}
      </div>

      {practiceWords.length > 0 && currentWord && (
        <Flashcard 
          word={currentWord}
          isFlipped={isFlipped}
          flipCard={flipCard}
          showHint={showHint}
          setShowHint={setShowHint}
          showExample={showExample}
          setShowExample={setShowExample}
          feedback={feedback}
          feedbackMessage={feedbackMessage}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          speakWord={speakWord}
        />
      )}
      
      {practiceWords.length === 0 && (
        <div className="empty-state">
          Bu seviyede kelime bulunamadı.
        </div>
      )}

      <div className="controls">
        <div className="answer-buttons">
          <button className="btn-unknown" onClick={() => handleAnswer(false)} disabled={buttonCooldown}>✗ Bilmiyorum</button>
          <button className="btn-known" onClick={() => handleAnswer(true)} disabled={buttonCooldown}>✓ Biliyorum</button>
        </div>
        <div className="nav-buttons">
          <button className="btn-prev" onClick={prevWord} disabled={currentWordIndex === 0 || buttonCooldown}>← Önceki</button>
          <button className="btn-next" onClick={nextWord} disabled={currentWordIndex === practiceWords.length - 1 || buttonCooldown}>Sonraki →</button>
        </div>
      </div>
    </div>
);

const WordListView = ({
  words,
  searchTerm,
  setSearchTerm,
  filteredWords,
  selectedLevel,
  setSelectedLevel,
  favorites,
  toggleFavorite,
  speakWord
}) => {
  return (
    <div className="word-list">
      <h2>Tüm Kelimeler ({words.length}) - Alfabetik</h2>

      <div className="search-box">
        <input
          type="text"
          placeholder="Kelime veya anlam ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={selectedLevel}
          onChange={(e)=>setSelectedLevel(e.target.value)}
        >
          <option value="ALL">All</option>
          <option value="A1">A1</option>
          <option value="A2">A2</option>
          <option value="B1">B1</option>
          <option value="B2">B2</option>
          <option value="C1">C1</option>
          <option value="C2">C2</option>
        </select>
      </div>

      <div className="word-grid">
        {filteredWords.map((word) => (
          <div key={word.term} className="word-card">
            <button
              className="fav-btn"
              onClick={() => toggleFavorite(word)}
            >
              {(favorites || []).find(w => w.term === word.term) ? "⭐" : "☆"}
            </button>

            <button
              className="list-speak-btn"
              onClick={(e) => {
                e.stopPropagation();
                speakWord(word);
              }}
              title="Telaffuz"
            >
              🔊
            </button>

            <h4>
             {word.term}
             <span className="level">{word.level}</span>
            </h4>
            <p className="meaning">{word.meaning}</p>
            <p className="hint">{word.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const SynonymListView = ({ words, level, setLevel, searchTerm, setSearchTerm, favorites, toggleFavorite, speakWord }) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const t0 = setTimeout(() => {
      if (!cancelled) setItems(null);
    }, 0);
    const t = setTimeout(() => {
      try {
        const pool = buildSynonymQuestionPool(words);
        if (!cancelled) setItems(pool);
      } catch {
        if (!cancelled) setItems([]);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [words]);
  const filtered = useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.filter((q) => {
      const byLevel = level === "ALL" || q.level === level;
      const qText = `${q.question} ${q.correct} ${q.meaning || ""}`.toLowerCase();
      const bySearch = !searchTerm || qText.includes(searchTerm.toLowerCase());
      return byLevel && bySearch;
    });
  }, [items, level, searchTerm]);
  return (
    <div className="word-list">
      <h2>Synonyms Listesi ({items === null ? "…" : filtered.length})</h2>
      <div className="search-box">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Synonym ara..." />
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ALL">ALL</option><option value="A1">A1</option><option value="A2">A2</option>
          <option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option><option value="C2">C2</option>
        </select>
      </div>
      {items === null && (
        <div className="empty-state" role="status">Liste yükleniyor…</div>
      )}
      <div className="word-grid">
        {filtered.map((q) => {
          const key = `${q.question}__${q.correct}__${q.level}`;
          const fav = favorites.includes(key);
          return (
            <div key={key} className="word-card">
              <div className="list-card-top">
                <span className="list-card-type">Synonym</span>
                <button
                  className="list-speak-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord({ term: q.question });
                  }}
                  title="Telaffuz"
                >
                  🔊
                </button>
              </div>
              <button className="fav-btn" onClick={() => toggleFavorite(key)}>{fav ? "⭐" : "☆"}</button>
              <h4>{q.question} <span className="level">{q.level}</span></h4>
              <p className="meaning">Doğru: {q.correct}</p>
              {q.meaning && <p className="hint">Anlam: {q.meaning}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PhrasalListView = ({ words, level, setLevel, searchTerm, setSearchTerm, favorites, toggleFavorite, speakWord }) => {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const t0 = setTimeout(() => {
      if (!cancelled) setItems(null);
    }, 0);
    const t = setTimeout(() => {
      try {
        const pool = buildPhrasalQuestionPool(words);
        if (!cancelled) setItems(pool);
      } catch {
        if (!cancelled) setItems([]);
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t);
    };
  }, [words]);
  const filtered = useMemo(() => {
    if (!items || items.length === 0) return [];
    return items.filter((q) => {
      const byLevel = level === "ALL" || q.level === level;
      const qText = `${q.base} ${q.correct} ${q.meaning || ""}`.toLowerCase();
      const bySearch = !searchTerm || qText.includes(searchTerm.toLowerCase());
      return byLevel && bySearch;
    });
  }, [items, level, searchTerm]);
  return (
    <div className="word-list">
      <h2>Phrasal Verbs Listesi ({items === null ? "…" : filtered.length})</h2>
      <div className="search-box">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Phrasal ara..." />
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ALL">ALL</option><option value="A1">A1</option><option value="A2">A2</option>
          <option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option><option value="C2">C2</option>
        </select>
      </div>
      {items === null && (
        <div className="empty-state" role="status">Liste yükleniyor…</div>
      )}
      <div className="word-grid">
        {filtered.map((q) => {
          const key = `${q.base}__${q.correct}__${q.level}`;
          const fav = favorites.includes(key);
          return (
            <div key={key} className="word-card">
              <div className="list-card-top">
                <span className="list-card-type">Phrasal</span>
                <button
                  className="list-speak-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord({ term: q.correct });
                  }}
                  title="Telaffuz"
                >
                  🔊
                </button>
              </div>
              <button className="fav-btn" onClick={() => toggleFavorite(key)}>{fav ? "⭐" : "☆"}</button>
              <h4>{q.base} <span className="level">{q.level}</span></h4>
              <p className="meaning">Doğru: {q.correct}</p>
              {q.meaning && <p className="hint">Not: {q.meaning}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const FavoritesView = ({ wordFavorites, synonymFavorites, phrasalFavorites, toggleWordFavorite, toggleSynFavorite, togglePhrasalFavorite }) => {
  const [tab, setTab] = useState("words");
  const total = wordFavorites.length + synonymFavorites.length + phrasalFavorites.length;
  return (
    <div className="word-list">
      <h2>⭐ Favoriler ({total})</h2>
      <div className="syn-controls">
        <button className={`syn-prev-btn ${tab==="words"?"active":""}`} onClick={() => setTab("words")}>Kelimeler</button>
        <button className={`syn-prev-btn ${tab==="synonyms"?"active":""}`} onClick={() => setTab("synonyms")}>Synonyms</button>
        <button className={`syn-prev-btn ${tab==="phrasal"?"active":""}`} onClick={() => setTab("phrasal")}>Phrasal</button>
      </div>
      {tab === "words" && (
        <div className="word-grid">
          {wordFavorites.map((word, idx) => (
            <div key={`${word.term}-${idx}`} className="word-card">
              <button className="fav-btn" onClick={() => toggleWordFavorite(word)}>⭐</button>
              <h4>{word.term}</h4><p className="meaning">{word.meaning}</p><p className="hint">{word.hint}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "synonyms" && (
        <div className="word-grid">
          {synonymFavorites.map((key) => (
            <div key={key} className="word-card">
              <button className="fav-btn" onClick={() => toggleSynFavorite(key)}>⭐</button>
              <h4>{key.split("__")[0]}</h4><p className="meaning">Synonym: {key.split("__")[1]}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "phrasal" && (
        <div className="word-grid">
          {phrasalFavorites.map((key) => (
            <div key={key} className="word-card">
              <button className="fav-btn" onClick={() => togglePhrasalFavorite(key)}>⭐</button>
              <h4>{key.split("__")[0]}</h4><p className="meaning">Phrasal: {key.split("__")[1]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const WrongWordsView = ({ wrongWords }) => (
    <div className="wrong-words">
      <h2>Yanlış Bilinen Kelimeler ({wrongWords.length})</h2>
      {wrongWords.length === 0 ? (
        <p className="empty">Henüz yanlış bilinen kelime yok! Harika gidiyorsun! 🎉</p>
      ) : (
        <div className="word-grid">
          {wrongWords.map((word, idx) => (
            <div key={idx} className="word-card wrong">
              <h4>{word.term}</h4>
              <p className="meaning">{word.meaning}</p>
              <p className="hint">{word.hint}</p>
            </div>
          ))}
        </div>
      )}
    </div>
);

const ProfileView = ({ user, setUser, logout }) => {
    // URL'den stili çıkar (varsa)
    const getStyleFromUrl = (url) => {
      if (!url) return "adventurer";
      if (url.includes("adventurer")) return "adventurer";
      if (url.includes("notionists")) return "notionists";
      if (url.includes("micah")) return "micah";
      if (url.includes("lorelei")) return "lorelei";
      if (url.includes("bottts")) return "bottts";
      if (url.includes("avataaars")) return "avataaars";
      return "adventurer";
    };

    const [showAvatarBuilder, setShowAvatarBuilder] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState(null); // Rozet detayı için
    const [editForm, setEditForm] = useState({
      nickname: user.nickname || user.username,
      username: user.username, // Username eklendi
      bio: user.bio || "",
      avatar: user.avatar || "👤",
      avatarStyle: getStyleFromUrl(user.avatar) 
    });

    const handleDeleteAccount = async () => {
      if (!confirm("Hesabını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz!")) return;
      
      try {
        const res = await fetch(apiUrl('/api/profile'), {
          method: 'DELETE',
          headers: { 'Authorization': user.token }
        });
        
        if (res.ok) {
          logout();
        } else {
          alert("Silme işlemi başarısız oldu.");
        }
      } catch (err) {
        console.error(err);
        alert("Hata oluştu.");
      }
    };

    const handleSave = () => {
      // Token Check
      if (!user || !user.token) {
        alert("Oturum süresi dolmuş veya geçersiz. Lütfen çıkış yapıp tekrar giriş yapın.");
        return;
      }

      fetch(apiUrl('/api/profile/update'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user.token
        },
        body: JSON.stringify({
          nickname: editForm.nickname,
          username: editForm.username, // Username gönder
          bio: editForm.bio,
          avatar: editForm.avatar
        })
      })
      .then(async (res) => {
        const data = await readResponseJson(res);
        if (data.success) {
          const updatedUser = { ...user, ...data.user, token: user.token };
          setUser(updatedUser);
          localStorage.setItem("wb_user", JSON.stringify(updatedUser));
          setIsEditing(false);
        } else {
          if (data.error && (data.error.includes("Token") || data.error.includes("auth"))) {
             alert("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
             logout();
          } else {
             alert("Kaydetme başarısız: " + (data.error || "Bilinmeyen hata"));
          }
        }
      })
      .catch(err => {
        console.error(err);
        alert(err?.message || "Bağlantı hatası!");
      });
    };

    const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert("Dosya boyutu çok büyük (Max 5MB)");
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          setEditForm(prev => ({
            ...prev,
            avatar: reader.result,
            avatarStyle: "custom"
          }));
        };
        reader.readAsDataURL(file);
      }
    };

    return (
      <div className="profile-view">
        <div className={`profile-header ${isEditing ? 'editing' : ''}`}>
          <div className="profile-avatar-container">
            <div style={{position: 'relative', display: 'inline-block'}}>
              <img 
                src={isEditing ? editForm.avatar : user.avatar} 
                alt="Avatar" 
                className="profile-avatar-img"
                onError={(e) => e.target.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
              />
              {isEditing && (
                <button 
                  className="edit-avatar-btn"
                  onClick={() => setShowAvatarBuilder(true)}
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    right: '0',
                    background: '#ff9f1c',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                  }}
                >
                  ✏️
                </button>
              )}
            </div>
            
            {showAvatarBuilder && (
              <AvatarBuilder 
                initialSeed={user.username} 
                setEditForm={setEditForm} 
                handleFileChange={handleFileChange}
                onClose={() => setShowAvatarBuilder(false)}
              />
            )}
          </div>
          
          <div className="profile-info">
            <div className="profile-header-top">
              <div className="profile-header-main">
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.8rem", color: "#888" }}>Takma Ad</label>
                        <input
                          value={editForm.nickname}
                          onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                          placeholder="Takma Ad"
                          style={{ width: "100%" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.8rem", color: "#888" }}>Kullanıcı Adı (@)</label>
                        <input
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          placeholder="Kullanıcı Adı"
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <h2>
                      {user.nickname} <span className="username">(@{user.username})</span>
                    </h2>
                    {isUserPremium(user) ? (
                      <div className="profile-premium-row">
                        <span className="profile-premium-badge" title="WordBoost Premium üyeliği aktif">
                          Premium
                        </span>
                        <span className="profile-premium-label">WordBoost Premium üyesi</span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", marginLeft: "auto" }}>
                {isEditing && (
                  <button className="delete-btn" onClick={handleDeleteAccount} title="Hesabı Sil">
                    🗑️
                  </button>
                )}
                <button className="edit-btn" onClick={() => isEditing ? handleSave() : setIsEditing(true)}>
                  {isEditing ? "💾 Kaydet" : "✏️ Düzenle"}
                </button>
              </div>
            </div>
            
            {isEditing ? (
              <div style={{marginTop: '10px'}}>
                <label style={{fontSize: '0.8rem', color: '#888', marginBottom: '5px', display:'block'}}>Biyografi</label>
                <textarea 
                  value={editForm.bio} 
                  onChange={e => setEditForm({...editForm, bio: e.target.value})}
                  placeholder="Hakkında bir şeyler yaz..."
                  style={{width: '100%', minHeight: '100px'}}
                />
              </div>
            ) : (
              <>
                <p className="bio">{user.bio || "Henüz biyografi eklenmemiş."}</p>
                {isUserPremium(user) && user.premiumUntil ? (
                  <p className="profile-premium-expiry">
                    Üyelik bitişi:{" "}
                    <strong>{formatPremiumUntilTr(user.premiumUntil)}</strong>
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="profile-stats">
          <div className="p-stat">
            <span className="icon">🔥</span>
            <span className="value">{user.streak || 0}</span>
            <span className="label">Günlük Seri</span>
          </div>
          <div className="p-stat">
            <span className="icon">📚</span>
            <span className="value">{user.stats?.studied || 0}</span>
            <span className="label">Çalışılan</span>
          </div>
          <div className="p-stat">
            <span className="icon">🧠</span>
            <span className="value">{user.stats?.known || 0}</span>
            <span className="label">Bilinen</span>
          </div>
        </div>

        <div className="badges-section">
          <h3>🏅 Rozetlerim</h3>
          <div className="badges-grid">
            {user.badges && user.badges.length > 0 ? (
              user.badges.map(badgeId => {
                const badgeInfo = BADGES[badgeId] || { icon: '🏆', name: badgeId, desc: '' };
                return (
                  <div 
                    key={badgeId} 
                    className="badge-item clickable"
                    onClick={() => setSelectedBadge(badgeInfo)}
                  >
                    <div className="badge-icon">{badgeInfo.icon}</div>
                    <span>{badgeInfo.name}</span>
                  </div>
                );
              })
            ) : (
              <p className="no-badges">Henüz rozet kazanmadın. Çalışmaya başla!</p>
            )}
          </div>
        </div>

        {selectedBadge && (
          <div className="badge-modal-overlay" onClick={() => setSelectedBadge(null)}>
            <div className="badge-modal" onClick={e => e.stopPropagation()}>
              <div className="badge-modal-icon">{selectedBadge.icon}</div>
              <h3>{selectedBadge.name}</h3>
              <p>{selectedBadge.desc}</p>
              <button onClick={() => setSelectedBadge(null)}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    );
};

const PublicProfileView = ({ selectedUser, setCurrentView }) => {
    const [selectedBadge, setSelectedBadge] = useState(null);

    if (!selectedUser) return <div className="loading">Kullanıcı bulunamadı</div>;
    const studied = selectedUser.stats?.studied || 0;
    const known = selectedUser.stats?.known || 0;
    const unknown = selectedUser.stats?.unknown || 0;
    const successRate = studied > 0 ? Math.round((known / studied) * 100) : 0;
    const nowMs = new Date().getTime();
    const joinedDays = selectedUser.createdAt
      ? Math.max(1, Math.floor((nowMs - new Date(selectedUser.createdAt).getTime()) / 86400000))
      : 0;
    const consistencyScore = Math.min(100, (selectedUser.streak || 0) * 4);
    const baseProgress = Math.min(100, Math.round((known * 0.6 + (selectedUser.streak || 0) * 2 + successRate) / 2));
    const levelEstimate = {
      A1: Math.max(5, 28 - Math.round(baseProgress * 0.12)),
      A2: Math.max(8, 24 - Math.round(baseProgress * 0.09)),
      B1: Math.max(12, 22 - Math.round(baseProgress * 0.05)),
      B2: Math.max(10, 12 + Math.round(baseProgress * 0.05)),
      C1: Math.max(8, 8 + Math.round(baseProgress * 0.08)),
      C2: Math.max(5, 6 + Math.round(baseProgress * 0.1)),
    };
    const levelTotal = Object.values(levelEstimate).reduce((acc, n) => acc + n, 0) || 1;
    const levelPercent = Object.fromEntries(
      Object.entries(levelEstimate).map(([lv, val]) => [lv, Math.round((val / levelTotal) * 100)])
    );
    const donutGradient = `conic-gradient(
      #4caf50 0% ${levelPercent.A1}%,
      #8bc34a ${levelPercent.A1}% ${levelPercent.A1 + levelPercent.A2}%,
      #ffeb3b ${levelPercent.A1 + levelPercent.A2}% ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1}%,
      #ff9800 ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1}% ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1 + levelPercent.B2}%,
      #ff5722 ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1 + levelPercent.B2}% ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1 + levelPercent.B2 + levelPercent.C1}%,
      #9c27b0 ${levelPercent.A1 + levelPercent.A2 + levelPercent.B1 + levelPercent.B2 + levelPercent.C1}% 100%
    )`;

    return (
      <div className="profile-view">
        <button className="back-btn" onClick={() => setCurrentView('leaderboard')}>← Geri Dön</button>
        
        <div className="profile-header">
          <div className="profile-avatar-container">
            <img 
              src={selectedUser.avatar} 
              alt="Avatar" 
              className="profile-avatar-img"
              onError={(e) => e.target.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedUser.username}`}
            />
          </div>
          
          <div className="profile-info">
            <div className="profile-header-main">
              <div className="profile-public-title-row">
                <h2>
                  {selectedUser.nickname} <span className="username">(@{selectedUser.username})</span>
                </h2>
                {selectedUser.isPremium ? (
                  <span className="profile-premium-badge" title="WordBoost Premium üyesi">
                    Premium
                  </span>
                ) : null}
              </div>
              {selectedUser.isPremium ? (
                <p className="profile-premium-label profile-premium-label--public">WordBoost Premium üyesi</p>
              ) : null}
            </div>
            <p className="bio">{selectedUser.bio || "Henüz biyografi eklenmemiş."}</p>
            <p className="join-date">Katılım: {new Date(selectedUser.createdAt).toLocaleDateString("tr-TR")}</p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="p-stat">
            <span className="icon">🔥</span>
            <span className="value">{selectedUser.streak || 0}</span>
            <span className="label">Günlük Seri</span>
          </div>
          <div className="p-stat">
            <span className="icon">📚</span>
            <span className="value">{selectedUser.stats?.studied || 0}</span>
            <span className="label">Çalışılan</span>
          </div>
          <div className="p-stat">
            <span className="icon">🧠</span>
            <span className="value">{selectedUser.stats?.known || 0}</span>
            <span className="label">Bilinen</span>
          </div>
        </div>

        <div className="badges-section">
          <h3>🏅 Rozetler</h3>
          <div className="badges-grid">
            {selectedUser.badges && selectedUser.badges.length > 0 ? (
              selectedUser.badges.map(badgeId => {
                const badgeInfo = BADGES[badgeId] || { icon: '🏆', name: badgeId, desc: '' };
                return (
                  <div 
                    key={badgeId} 
                    className="badge-item clickable"
                    onClick={() => setSelectedBadge(badgeInfo)}
                  >
                    <div className="badge-icon">{badgeInfo.icon}</div>
                    <span>{badgeInfo.name}</span>
                  </div>
                );
              })
            ) : (
              <p className="no-badges">Henüz rozet kazanmamış.</p>
            )}
          </div>
        </div>

        <div className="public-dashboard">
          <h3>📊 Genel İlerleme Özeti</h3>
          <p className="public-dashboard-note">
            Bu alan, profil sahibinin herkese açık performans özetidir.
          </p>

          <div className="public-dashboard-grid">
            <div className="public-kpi">
              <span>Başarı Oranı</span>
              <strong>%{successRate}</strong>
            </div>
            <div className="public-kpi">
              <span>Günlük Seri</span>
              <strong>{selectedUser.streak || 0} gün</strong>
            </div>
            <div className="public-kpi">
              <span>Toplam Çalışma</span>
              <strong>{studied}</strong>
            </div>
            <div className="public-kpi">
              <span>Katılım Süresi</span>
              <strong>{joinedDays} gün</strong>
            </div>
          </div>

          <div className="public-progress-bars">
            <div className="public-progress-item">
              <div className="label-row">
                <span>Bilinen Kelime Oranı</span>
                <span>%{successRate}</span>
              </div>
              <div className="bar-bg">
                <div className="bar-fill known" style={{ width: `${successRate}%` }} />
              </div>
            </div>
            <div className="public-progress-item">
              <div className="label-row">
                <span>Devamlılık Skoru</span>
                <span>%{consistencyScore}</span>
              </div>
              <div className="bar-bg">
                <div className="bar-fill streak" style={{ width: `${consistencyScore}%` }} />
              </div>
            </div>
          </div>

          <div className="public-mini-stats">
            <span>✅ Bilinen: {known}</span>
            <span>❌ Bilinmeyen: {unknown}</span>
          </div>

          <div className="public-level-estimate">
            <h4>🎯 Tahmini Seviye Dağılımı</h4>
            <div className="public-level-estimate-content">
              <div className="level-donut" style={{ background: donutGradient }}>
                <div className="donut-center">
                  <strong>%{successRate}</strong>
                  <span>Başarı</span>
                </div>
              </div>
              <div className="level-legend">
                {Object.entries(levelPercent).map(([lv, val]) => (
                  <div key={lv} className="level-legend-item">
                    <span className={`dot ${lv.toLowerCase()}`} />
                    <span>{lv}</span>
                    <strong>%{val}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {selectedBadge && (
          <div className="badge-modal-overlay" onClick={() => setSelectedBadge(null)}>
            <div className="badge-modal" onClick={e => e.stopPropagation()}>
              <div className="badge-modal-icon">{selectedBadge.icon}</div>
              <h3>{selectedBadge.name}</h3>
              <p>{selectedBadge.desc}</p>
              <button onClick={() => setSelectedBadge(null)}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    );
};

const LeaderboardView = ({ user, setCurrentView, setSelectedUser }) => {
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);

    useEffect(() => {
      fetch(apiUrl("/api/leaderboard"))
        .then(async (res) => {
          const data = await readResponseJson(res);
          if (!res.ok) throw new Error("leaderboard");
          return Array.isArray(data) ? data : [];
        })
        .then((data) => {
          setLeaders(data);
          setLoading(false);
        })
        .catch(() => {
          setLeaders([]);
          setLoading(false);
        });
    }, []);

    const handleSearch = (e) => {
      const q = e.target.value;
      setSearchQuery(q);
      
      if (q.length > 2) {
        fetch(`${apiUrl("/api/users/search")}?q=${encodeURIComponent(q)}`)
          .then(async (res) => readResponseJson(res))
          .then((data) => setSearchResults(Array.isArray(data) ? data : []))
          .catch(() => setSearchResults([]));
      } else {
        setSearchResults([]);
      }
    };

    const openProfile = (targetUsername) => {
      if (user && user.username === targetUsername) {
        setCurrentView('profile');
        return;
      }

      setLoading(true);
      fetch(apiUrl(`/api/users/${encodeURIComponent(targetUsername)}`))
        .then(async (res) => {
          const data = await readResponseJson(res);
          if (!res.ok) {
            const detail =
              data?.error ||
              data?.detail ||
              (typeof data === "string" ? data : null) ||
              `HTTP ${res.status}`;
            throw new Error(detail);
          }
          return data;
        })
        .then((data) => {
          setSelectedUser(data);
          setCurrentView("public-profile");
          setLoading(false);
        })
        .catch((e) => {
          const msg = e?.message || String(e);
          const infraHint =
            /HTTP\s*404|NOT_FOUND|JSON yerine metin/i.test(msg) || msg.includes("BACKEND_URL");
          const hint = infraHint
            ? "\n\nÇözüm: Vercel’de BACKEND_URL + (tercihen) VITE_SOCKET_URL = Railway kökü; yeniden deploy. Veya kullanıcı adı listede yoksa 404 normaldir."
            : "";
          alert(`Kullanıcı profili yüklenemedi: ${msg}${hint}`);
          setLoading(false);
        });
    };

    if (loading) return <div className="loading-screen">Yükleniyor...</div>;

    return (
      <div className="leaderboard-view">
        <h2>🏆 Liderlik Tablosu & Ara</h2>
        
        <div className="user-search-container">
          <input 
            type="text" 
            placeholder="🔍 Kullanıcı Ara..." 
            value={searchQuery}
            onChange={handleSearch}
            className="user-search-input"
          />
          
          {searchResults.length > 0 && (
            <div className="search-results-dropdown">
              {searchResults.map(u => (
                <div key={u._id} className="search-result-item" onClick={() => openProfile(u.username)}>
                  <img src={u.avatar} alt="av" className="mini-avatar" />
                  <span className="search-result-name">{u.nickname || u.username}</span>
                  {u.isPremium ? (
                    <span className="search-result-premium" title="Premium üye">
                      PRO
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="leaderboard-list">
          <div className="lb-header">
            <span>#</span>
            <span>Kullanıcı</span>
            <span>Seri</span>
            <span>Puan</span>
          </div>
          
          {leaders.length === 0 && !loading && (
            <div style={{padding: '20px', textAlign: 'center', color: '#888'}}>
              Henüz kimse listeye girmemiş. İlk sen ol! 🚀
            </div>
          )}

          {leaders.filter(u => u && u.username && u.username.trim().length > 0 && u.stats && typeof u.streak === 'number').map((u, idx) => (
            <div 
              key={u._id || idx} 
              className={`lb-item ${user && user.username === u.username ? 'me' : ''}`}
              onClick={() => openProfile(u.username)}
              style={{cursor: 'pointer'}}
            >
              <span className="rank">{idx + 1}</span>
              <div className="user-col">
                <span className="avatar">
                  {u.avatar && (u.avatar.startsWith('http') || u.avatar.startsWith('data:')) ? (
                    <img src={u.avatar} alt="av" className="lb-avatar-img" />
                  ) : (
                    <div className="lb-avatar-img" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#333', color: '#fff'}}>
                       {u.avatar || "👤"}
                    </div>
                  )}
                </span>
                <span className="nick" title={u.nickname || u.username}>
                  {(u.nickname && u.nickname.trim().length > 0) ? u.nickname : u.username}
                </span>
                {u.isPremium ? (
                  <span className="lb-premium-tag" title="Premium üye">
                    PRO
                  </span>
                ) : null}
              </div>
              <span className="streak" style={{display: 'inline-block'}}>🔥 {u.streak || 0}</span>
              <span className="score" style={{display: 'inline-block'}}>⭐ {u.stats?.known || 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
};

const MatchingGameView = ({ words, setCurrentView }) => {
    const [matchingGame, setMatchingGame] = useState(false);
    const [matchingCards, setMatchingCards] = useState([]);
    const [selectedCards, setSelectedCards] = useState([]);
    const [matchedPairs, setMatchedPairs] = useState([]);
    const [moves, setMoves] = useState(0);
    const [gameTime, setGameTime] = useState(0);
    const gameTimerRef = useRef(null);
    const [gameFinished, setGameFinished] = useState(false);

    useEffect(() => {
        if (matchingGame && !gameFinished && matchedPairs.length < 8) {
          const timer = setInterval(() => {
            setGameTime(prev => prev + 1);
          }, 1000);
          gameTimerRef.current = timer;
          return () => clearInterval(timer);
        }
    }, [matchingGame, gameFinished, matchedPairs.length]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const calculateScore = () => {
        const baseScore = 1000;
        const timeBonus = Math.max(0, 300 - gameTime) * 2;
        const moveBonus = Math.max(0, 100 - moves * 5);
        return baseScore + timeBonus + moveBonus;
    };

    const startMatchingGame = () => {
        const selectedWords = [...words].sort(() => Math.random() - 0.5).slice(0, 8);
        const cards = [];
        
        selectedWords.forEach((word, index) => {
          cards.push({
            id: `term-${index}`,
            content: word.term,
            type: 'term',
            pairId: index,
            word: word
          });
          cards.push({
            id: `meaning-${index}`,
            content: word.meaning,
            type: 'meaning',
            pairId: index,
            word: word
          });
        });
        
        setMatchingCards(cards.sort(() => Math.random() - 0.5));
        setSelectedCards([]);
        setMatchedPairs([]);
        setMoves(0);
        setGameTime(0);
        setGameFinished(false);
        setMatchingGame(true);
    };

    const handleCardClick = (card) => {
        if ((selectedCards || []).length === 2 || (selectedCards || []).find(c => c.id === card.id) || (matchedPairs || []).includes(card.pairId)) {
          return;
        }
    
        const newSelected = [...selectedCards, card];
        setSelectedCards(newSelected);
    
        if (newSelected.length === 2) {
          setMoves(prev => prev + 1);
          
          if (newSelected[0].pairId === newSelected[1].pairId) {
            playSound('correct');
            setMatchedPairs(prev => [...prev, card.pairId]);
            setSelectedCards([]);
            
            if (matchedPairs.length + 1 === 8) {
              setGameFinished(true);
              if (gameTimerRef.current) clearInterval(gameTimerRef.current);
            }
          } else {
            playSound('wrong');
            setTimeout(() => {
              setSelectedCards([]);
            }, 1000);
          }
        }
    };

    return (
    <div className="matching-game">
      {!matchingGame ? (
        <div className="game-start-screen">
          <h2>🎮 Eşleştirme Oyunu</h2>
          <p>8 çift kelimeyi en kısa sürede eşleştir!</p>
          
          <div className="game-rules">
            <div className="rule-item">
              <span className="icon">⏱️</span>
              <span>Zamana Karşı Yarış</span>
            </div>
            <div className="rule-item">
              <span className="icon">🧠</span>
              <span>Hafızanı Test Et</span>
            </div>
            <div className="rule-item">
              <span className="icon">🏆</span>
              <span>En Yüksek Skoru Yap</span>
            </div>
          </div>

          <button className="start-game-btn" onClick={startMatchingGame}>
            OYUNU BAŞLAT
          </button>
        </div>
      ) : (
        <>
          <h2>🎮 Eşleştirme Oyunu</h2>
          
          {!gameFinished ? (
            <>
              <div className="game-stats">
                <div className="game-stat">
                  <span>⏱️ Süre</span>
                  <strong>{formatTime(gameTime)}</strong>
                </div>
                <div className="game-stat">
                  <span>🎯 Hamle</span>
                  <strong>{moves}</strong>
                </div>
                <div className="game-stat">
                  <span>✓ Eşleşme</span>
                  <strong>{matchedPairs.length}/8</strong>
                </div>
              </div>

              <div className="matching-grid">
                {matchingCards.map((card) => {
                  const isSelected = (selectedCards || []).find(c => c.id === card.id);
                  const isMatched = matchedPairs.includes(card.pairId);
                  
                  return (
                    <button
                      key={card.id}
                      className={`matching-card ${isSelected ? 'selected' : ''} ${isMatched ? 'matched' : ''} ${card.type}`}
                      onClick={() => handleCardClick(card)}
                      disabled={isMatched || selectedCards.length === 2}
                    >
                      <span className="card-content">{card.content}</span>
                      {isMatched && <span className="check-mark">✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="game-results">
              <h3>🎉 Tebrikler!</h3>
              <div className="final-stats">
                <div className="final-stat">
                  <span>⏱️ Süre</span>
                  <strong>{formatTime(gameTime)}</strong>
                </div>
                <div className="final-stat">
                  <span>🎯 Hamle</span>
                  <strong>{moves}</strong>
                </div>
                <div className="final-stat">
                  <span>🏆 Skor</span>
                  <strong className="score-highlight">{calculateScore()}</strong>
                </div>
              </div>
              <div className="game-buttons">
                <button onClick={startMatchingGame}>🔄 Yeniden Oyna</button>
                <button className="btn-secondary" onClick={() => { setMatchingGame(false); setCurrentView('practice'); }}>Çalışmaya Dön</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    );
};

const TestManager = ({ words, setCurrentView, setWrongWords }) => {
    const [testMode, setTestMode] = useState('setup'); // setup, test, results
    const [testWords, setTestWords] = useState([]);
    const [testIndex, setTestIndex] = useState(0);
    const [testResults, setTestResults] = useState([]);
    const [testOptions, setTestOptions] = useState([]);
    const [selectedOption, setSelectedOption] = useState(null);
    const [showResult, setShowResult] = useState(false);
    const [testType, setTestType] = useState('EN-TR');
    const [error, setError] = useState('');

    const startTest = (countValue, wordSource = words) => {
        if (countValue < 5 || countValue > wordSource.length) {
          setError(`Kelime sayısı 5-${wordSource.length} arasında olmalı`);
          return;
        }
        
        const shuffled = [...wordSource].sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, countValue);
        
        setTestWords(selected);
        setTestIndex(0);
        setTestResults([]);
        setTestMode('test');
        setShowResult(false);
        setSelectedOption(null);
        
        const options = generateOptions(selected[0], words);
        setTestOptions(options);
    };

    const startRetest = () => {
        const wrongAnswers = testResults.filter(r => !r.correct).map(r => r.word);
        startTest(wrongAnswers.length, wrongAnswers);
    };

    const handleTestAnswer = (option) => {
        if (showResult) return;
        
        setSelectedOption(option);
        setShowResult(true);
        
        const currentWord = testWords[testIndex];
        const isCorrect = option.term === currentWord.term;
        
        if (isCorrect) {
          playSound('correct');
        } else {
          playSound('wrong');
          setWrongWords(prev => {
            if (!(prev || []).find(w => w.term === currentWord.term)) {
              return [...prev, currentWord];
            }
            return prev;
          });
        }
        
        setTestResults(prev => [...prev, {
          word: currentWord,
          selected: option,
          correct: isCorrect
        }]);
        
        setTimeout(() => {
          if (testIndex < testWords.length - 1) {
            setTestIndex(prev => prev + 1);
            setShowResult(false);
            setSelectedOption(null);
            const nextOptions = generateOptions(testWords[testIndex + 1], words);
            setTestOptions(nextOptions);
          } else {
            setTestMode('results');
          }
        }, 1500);
    };

    if (testMode === 'setup') {
        return (
            <div className="test-setup">
              <h2>🎯 Test Modu</h2>
              <p className="description">Kendini test etmeye hazır mısın?</p>
              
              {error && <div className="error">{error}</div>}
              
              <div className="test-config-container">
                <div className="config-item">
                  <label>Soru Sayısı</label>
                  <div className="test-input">
                    <input 
                      id="test-count-input"
                      type="number"
                      defaultValue={10}
                      min={5}
                      max={words.length}
                    />
                    <span>/ {words.length}</span>
                  </div>
                </div>
        
                <div className="config-item">
                  <label>Test Türü</label>
                  <div className="test-type-selector">
                    <button 
                      className={`type-btn ${testType === 'EN-TR' ? 'active' : ''}`}
                      onClick={() => setTestType('EN-TR')}
                    >
                      🇬🇧 ➔ 🇹🇷
                      <span>İngilizce - Türkçe</span>
                    </button>
                    <button 
                      className={`type-btn ${testType === 'TR-EN' ? 'active' : ''}`}
                      onClick={() => setTestType('TR-EN')}
                    >
                      🇹🇷 ➔ 🇬🇧
                      <span>Türkçe - İngilizce</span>
                    </button>
                  </div>
                </div>
              </div>
        
              <button className="start-test-btn" onClick={() => {
                  const input = document.getElementById('test-count-input');
                  startTest(input ? parseInt(input.value) : 10);
              }}>
                TESTİ BAŞLAT
              </button>
              
              <div className="test-info">
                <div className="info-item">
                  <span className="icon">📝</span>
                  <span>4 şıklı sorular</span>
                </div>
                <div className="info-item">
                  <span className="icon">⏱️</span>
                  <span>Süre sınırı yok</span>
                </div>
                <div className="info-item">
                  <span className="icon">📊</span>
                  <span>Detaylı analiz</span>
                </div>
              </div>
            </div>
        );
    }

    if (testMode === 'test') {
        const currentWord = testWords[testIndex];
        const progress = ((testIndex + 1) / testWords.length) * 100;
        const questionText = testType === 'EN-TR' ? currentWord.term : currentWord.meaning;

        return (
            <div className="test-mode">
              <div className="test-progress-bar">
                <div className="progress-fill" style={{width: `${progress}%`}}></div>
              </div>
              <div className="test-header">
                <span>Soru {testIndex + 1} / {testWords.length}</span>
                <span>Doğru: {testResults.filter(r => r.correct).length}</span>
              </div>
              
              <div className="test-question">
                <span className="lang-badge">{testType === 'EN-TR' ? '🇬🇧 İNGİLİZCE' : '🇹🇷 TÜRKÇE'}</span>
                <h3>"{questionText}"</h3>
                <p>kelimesinin anlamı nedir?</p>
              </div>
              
              <div className="test-options">
                {testOptions.map((option, idx) => {
                  const optionText = testType === 'EN-TR' ? option.meaning : option.term;
                  
                  return (
                    <button
                      key={idx}
                      className={`option-btn ${showResult ? 
                        (option.term === currentWord.term ? 'correct' : 
                         selectedOption?.term === option.term ? 'wrong' : '') : ''}`}
                      onClick={() => handleTestAnswer(option)}
                      disabled={showResult}
                    >
                      {optionText}
                    </button>
                  );
                })}
              </div>
              
              {showResult && (
                <div className={`test-feedback ${testResults[testResults.length - 1]?.correct ? 'correct' : 'wrong'}`}>
                  {testResults[testResults.length - 1]?.correct ? '✓ Doğru!' : '✗ Yanlış!'}
                </div>
              )}
            </div>
        );
    }

    if (testMode === 'results') {
        const correctCount = testResults.filter(r => r.correct).length;
        const percentage = Math.round((correctCount / testWords.length) * 100);
        const wrongCount = testResults.filter(r => !r.correct).length;

        return (
            <div className="test-results">
              <h2>🎉 Test Sonuçları</h2>
              
              <div className="score-circle">
                <div className="score">{percentage}%</div>
                <div style={{fontSize: '1rem', opacity: 0.8}}>{correctCount}/{testWords.length}</div>
              </div>
              
              <div className="result-message">
                {percentage >= 90 ? '🏆 Mükemmel!' : 
                 percentage >= 70 ? '🌟 Çok İyi!' : 
                 percentage >= 50 ? '👍 İyi gidiyorsun!' : 
                 '💪 Daha çok çalışmalısın!'}
              </div>
              
              {wrongCount > 0 && (
                <div className="wrong-answers">
                  <h3>📚 Yanlışlar</h3>
                  {testResults.filter(r => !r.correct).map((result, idx) => (
                    <div key={idx} className="wrong-item">
                      <strong>{result.word.term}</strong> - Doğru: {result.word.meaning}
                      <br/>
                      <small>Senin cevabın: {result.selected.meaning}</small>
                    </div>
                  ))}
                  <button onClick={startRetest} style={{marginTop: '15px', width: '100%'}}>
                    🔄 Yanlışları Tekrar Test Et
                  </button>
                </div>
              )}
              
              <div style={{marginTop: '30px', display: 'flex', gap: '15px', justifyContent: 'center'}}>
                <button onClick={() => setTestMode('setup')}>Yeni Test</button>
                <button className="btn-secondary" onClick={() => setCurrentView('practice')}>Çalışmaya Dön</button>
              </div>
            </div>
        );
    }
    return null;
};

const RoomMenuView = ({ username, createRoom, joinRoom, loading, error }) => (
    <div className="room-menu">
      <h2>Çok Oyunculu Oda Sistemi</h2>
      <p className="description">Arkadaşlarınla birlikte kelime çalışması yap!</p>
      {error && <div className="error">{error}</div>}
      <div className="input-group">
        <input 
          id="username-input"
          type="text"
          placeholder="Kullanıcı adınız"
          defaultValue={username}
          style={{width: '100%', padding: '15px'}}
        />
      </div>
      <div className="actions">
        <button onClick={createRoom} disabled={loading}>{loading ? 'Oluşturuluyor...' : '🎮 Yeni Oda Oluştur'}</button>
        <div className="or">veya</div>
        <input 
          id="joincode-input"
          type="text"
          placeholder="Oda kodu (6 haneli)"
          maxLength={6}
          style={{width: '100%', padding: '15px'}}
        />
        <button onClick={joinRoom}>🚪 Odaya Katıl</button>
      </div>
    </div>
);

const RoomView = ({ roomCode, users, username, isHost, setCurrentView, leaveRoom }) => {
    return (
      <div className="room">
        <div className="room-header">
          <h3>Oda Kodu: <span className="code">{roomCode}</span></h3>
          <p>Bu kodu arkadaşlarınla paylaş!</p>
          <p style={{color: '#00d4ff', marginTop: '10px'}}>
            👥 Odada {users.length} kişi var
          </p>
          {isHost && <span className="host-badge">👑 Host</span>}
        </div>

        <div className="users">
          <h4>Kullanıcılar:</h4>
          <ul>
            {users.map((user, idx) => (
              <li key={idx} className={user.username === username ? 'me' : ''}>
                {user.username} {user.username === username && '(Sen)'} {user.isHost && '👑'}
              </li>
            ))}
          </ul>
        </div>

        <div className="room-actions">
          <button onClick={() => setCurrentView('practice')}>▶️ Çalışmaya Başla</button>
          <button className="btn-secondary" onClick={leaveRoom}>🚪 Odadan Çık</button>
        </div>
      </div>
    );
};

function App() {
  const renderCounter = useRef(0);
  renderCounter.current++;

  console.log(`WordBoost: App Render #${renderCounter.current}`);
  
  useEffect(() => {
    console.log("WordBoost: App component mounted successfully.");
  }, []);

  if (renderCounter.current > 150) {
    return (
      <div style={{ background: 'red', color: 'white', padding: '50px', minHeight: '100vh' }}>
        <h1>CRITICAL RENDER LOOP DETECTED</h1>
        <p>The application has exceeded 150 renders in a single session. This is a safety halt.</p>
        <p>Render count: {renderCounter.current}</p>
        <button onClick={() => window.location.reload()}>Hard Reset</button>
      </div>
    );
  }
  if (false && renderCounter.current > 100) {
    return (
      <div style={{ background: 'red', color: 'white', padding: '50px', minHeight: '100vh' }}>
        <h1>INFINITE RENDER LOOP DETECTED</h1>
        <p>Render count: {renderCounter.current}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  // 1. STATE & REFS
  const [selectedLevel, setSelectedLevel] = useState("ALL");
  const [practiceLevel, setPracticeLevel] = useState("ALL");
  const [currentFavTab, setCurrentFavTab] = useState('words');
  const [customDeckWords, setCustomDeckWords] = useState(null);
  const [isAutoAdvance, setIsAutoAdvance] = useState(false);
  const [words, setWords] = useState([]);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState(() => readInitialViewFromUrl());
  const [siteInfoTab, setSiteInfoTab] = useState(() =>
    readInitialViewFromUrl() === "site-info" ? readSiteInfoTabFromUrl() : "features"
  );
  const [loadingWords, setLoadingWords] = useState(true);
  const [splashExiting, setSplashExiting] = useState(true);
  const [splashDone, setSplashDone] = useState(true); // Default to true for stability
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [buttonCooldown, setButtonCooldown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [users, setUsers] = useState([]);
  const [roomStats, setRoomStats] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [synListLevel, setSynListLevel] = useState("ALL");
  const [phrasalListLevel, setPhrasalListLevel] = useState("ALL");
  const [synListSearch, setSynListSearch] = useState("");
  const [phrasalListSearch, setPhrasalListSearch] = useState("");
  const [showLogin, setShowLogin] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [newBadgeNotification, setNewBadgeNotification] = useState(null);

  const splashStartRef = useRef(Date.now());
  const syncTimeoutRef = useRef(null);

  // 2. STORAGE HELPER - Must be defined BEFORE useState calls that use it
  const loadFromStorage = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`ydt_${key}`);
      if (!saved || saved === "null" || saved === "undefined") return defaultValue;
      const parsed = JSON.parse(saved);
      return (parsed === null || parsed === undefined) ? defaultValue : parsed;
    } catch { return defaultValue; }
  };

  const [favorites, setFavorites] = useState(() => {
    try {
      const savedBundle = localStorage.getItem("ydt_favorites_bundle");
      if (savedBundle) {
        const parsed = JSON.parse(savedBundle);
        if (parsed && typeof parsed === 'object') {
          return {
            words: Array.isArray(parsed.words) ? parsed.words : [],
            synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
            phrasal: Array.isArray(parsed.phrasal) ? parsed.phrasal : [],
          };
        }
      }
      return { words: [], synonyms: [], phrasal: [] };
    } catch { return { words: [], synonyms: [], phrasal: [] }; }
  });

  const [stats, setStats] = useState(() => loadFromStorage('stats', { studied: 0, known: 0, unknown: 0 }));
  const [wrongWords, setWrongWords] = useState(() => loadFromStorage('wrongWords', []));
  const [practiceHistory, setPracticeHistory] = useState(() => loadFromStorage('practiceHistory', []));
  const [moduleStats, setModuleStats] = useState(() =>
    loadFromStorage("moduleStats", {
      synonyms: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
      phrasal: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
      speaking: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
    })
  );

  const wrongWordsCount = wrongWords.length;

  // 3. MEMOS & UTILS
  const shuffleArray = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const practiceWords = useMemo(() => {
    if (customDeckWords && customDeckWords.length > 0) return [...customDeckWords].sort(() => Math.random() - 0.5);
    let filtered = words;
    if (practiceLevel !== "ALL" && practiceLevel !== "CUSTOM") {
      if (practiceLevel.includes("-")) {
        const lvls = practiceLevel === "A1-A2" ? ["A1","A2"] : practiceLevel === "B1-B2" ? ["B1","B2"] : practiceLevel === "B1-C2" ? ["B1","B2","C1","C2"] : ["C1","C2"];
        filtered = words.filter(w => lvls.includes(w.level));
      } else filtered = words.filter(w => w.level === practiceLevel);
    }
    return [...filtered].sort(() => Math.random() - 0.5);
  }, [words, practiceLevel, customDeckWords]);

  const currentWord = practiceWords[currentWordIndex];
  const uniqueWords = useMemo(() => [...new Map(words.map(w => [w.term, w])).values()], [words]);
  const filteredWords = useMemo(() => {
    let res = uniqueWords;
    if (selectedLevel !== "ALL") res = res.filter(w => w.level === selectedLevel);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      res = res.filter(w => w.term.toLowerCase().includes(s) || w.meaning.toLowerCase().includes(s));
    }
    return res.sort((a,b) => a.term.localeCompare(b.term));
  }, [uniqueWords, searchTerm, selectedLevel]);

  // 4. HANDLERS
  const triggerCooldown = (duration = 800) => {
    setButtonCooldown(true);
    setTimeout(() => setButtonCooldown(false), duration);
  };

  const showFeedbackAnim = (type) => {
    const correctMessages = ["🔥 Aferin!", "⚡ Süper!", "🚀 İyi gidiyorsun!", "💪 Harika!", "🎯 Tam isabet!", "👏 Çok iyi!"];
    const wrongMessages = ["📚 Öğreniyoruz", "💡 Çalışmaya devam", "🧠 Yeni kelime öğrendin", "📖 Bir dahaki sefere", "🔁 Tekrar edeceğiz", "✨ Sorun değil!"];
    const list = type === "correct" ? correctMessages : wrongMessages;
    setFeedbackMessage(list[Math.floor(Math.random() * list.length)]);
    playSound(type);
    setFeedback({ type, id: Date.now() });
    setTimeout(() => setFeedback(null), 800);
  };

  const nextWord = () => {
    if (currentWordIndex < practiceWords.length - 1) {
      const ni = currentWordIndex + 1;
      setCurrentWordIndex(ni);
      setIsFlipped(false); setShowHint(false); setShowExample(false);
      if (isInRoom) socket.emit('change-word', { roomCode, wordIndex: ni });
    }
  };

  const speakWord = (wordObj) => {
    if (!wordObj?.term || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(wordObj.term); u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const triggerAssignmentProgress = (taskType, amount = 1) => {
    if (!user?.token) return;
    fetch(apiUrl('/api/assignments/progress/increment'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': user.token },
      body: JSON.stringify({ taskType, amount })
    }).catch(() => {});
  };

  const handleAnswer = (isKnown) => {
    if (buttonCooldown || !currentWord) return;
    triggerAssignmentProgress("general_practice", 1);
    triggerCooldown(800);
    setStats(prev => ({ ...prev, studied: prev.studied + 1, known: isKnown ? prev.known + 1 : prev.known, unknown: isKnown ? prev.unknown : prev.unknown + 1 }));
    if (!isKnown) {
       setWrongWords(prev => prev.some(w => w.term === currentWord.term) ? prev : [...prev, currentWord]);
    } else {
       setWrongWords(prev => prev.filter(w => w.term !== currentWord.term));
    }
    setPracticeHistory(prev => [{ term: currentWord.term, known: isKnown, date: new Date().toISOString() }, ...prev].slice(0, 100));
    showFeedbackAnim(isKnown ? "correct" : "wrong");
    setTimeout(() => { 
      if (currentWordIndex < practiceWords.length - 1) nextWord(); 
      else alert("Tebrikler! Tüm kelimeleri tamamladın."); 
    }, 800);
  };

  const createRoom = () => {
    const usernameInput = document.getElementById("username-input");
    const usernameValue = usernameInput ? usernameInput.value.trim() : "";
    if (!usernameValue || !socket.connected) { setError("Ad gerekli veya bağlantı yok"); return; }
    setLoading(true); setUsername(usernameValue);
    socket.emit("create-room", { username: usernameValue }, (data) => {
      setLoading(false);
      if (data?.success) { setRoomCode(data.roomCode); setUsers(data.users || []); setRoomStats(data.stats || {}); setIsHost(true); setIsInRoom(true); setCurrentView("room"); }
    });
  };

  const joinRoom = () => {
    const usernameInput = document.getElementById("username-input");
    const joinCodeInput = document.getElementById("joincode-input");
    const usernameValue = usernameInput ? usernameInput.value.trim() : "";
    const codeValue = joinCodeInput ? joinCodeInput.value.trim() : "";

    socket.emit("join-room", { roomCode: codeValue, username: usernameValue }, (response) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      setLoading(false);

      if (!response || !response.success) {
        setError(response?.error || "Odaya katılınamadı");
        return;
      }

      setRoomCode(response.roomCode);
      setUsers(response.users || []);
      setRoomStats(response.stats || {});
      setIsHost(response.isHost || false);
      setIsInRoom(true);
      setCurrentView("room");
    });
  };



  const startCustomPractice = (terms = []) => {
    if (!terms?.length) return;
    const norm = terms.map(t => t.toLowerCase());
    const deck = words.filter(w => norm.includes(w.term.toLowerCase()));
    if (!deck.length) return alert("Kelimeler bulunamadı.");
    setCustomDeckWords(deck);
    setPracticeLevel("CUSTOM");
    setCurrentWordIndex(0);
    setCurrentView("practice");
  };

  const toggleFavorite = (type, item) => {
    if (!item?.term) return;
    setFavorites(prev => {
      const list = prev[type] || [];
      const exists = list.some(i => i.term === item.term);
      const next = exists ? list.filter(i => i.term !== item.term) : [...list, item];
      return { ...prev, [type]: next };
    });
  };

  const onLogout = () => {
    localStorage.removeItem('ydt_token');
    setUser(null);
    setCurrentView('practice');
    setShowLogoutConfirm(false);
  };

  const trackModuleAnswer = (type, isCorrect, level) => {
    if (user && user.token) {
      fetch(apiUrl('/api/stats/update'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': user.token
        },
        body: JSON.stringify({
          studied: 1,
          known: isCorrect ? 1 : 0,
          unknown: isCorrect ? 0 : 1,
          module: type,
          level: level
        })
      }).then(async r => {
        const data = await readResponseJson(r);
        if (data.success) {
          setUser(prev => ({ ...prev, stats: data.stats, streak: data.streak, badges: data.badges }));
          if (data.newBadges && data.newBadges.length > 0) {
            setNewBadgeNotification({ badges: data.newBadges });
          }
        }
      }).catch(err => console.error("Module stats update failed:", err));
    }
    setStats(prev => ({
      studied: prev.studied + 1,
      known: isCorrect ? prev.known + 1 : prev.known,
      unknown: isCorrect ? prev.unknown : prev.unknown + 1
    }));
  };

  const toggleSynFavorite = (item) => toggleFavorite('synonyms', item);
  const togglePhrasalFavorite = (item) => toggleFavorite('phrasal', item);

  // ── EFFECTS ──────────────────────────────────────────────────────────────────

  // OAuth redirect fix
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const path = window.location.pathname || "";
    if (path === "/auth/google" || path.startsWith("/auth/google")) {
      window.location.replace(`/api/auth/google${window.location.search || ""}`);
    }
  }, []);

  // Token/user restore on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const usernameParam = params.get('username');
    const errorParam = params.get('error');
    if (errorParam) {
      if (errorParam === 'auth_cancel') alert("Giriş iptal edildi.");
      else alert("Giriş sırasında bir hata oluştu: " + errorParam);
      window.history.replaceState({}, document.title, "/");
      return;
    }
    if (token && usernameParam) {
      const userObj = { username: usernameParam, token };
      localStorage.setItem("wb_user", JSON.stringify(userObj));
      fetch(apiUrl("/api/profile"), { headers: { Authorization: token } })
        .then(async (res) => { const data = await readResponseJson(res); if (!res.ok) throw new Error(data?.error); return data; })
        .then((data) => {
          const fullUser = { ...data, token };
          setUser(fullUser);
          localStorage.setItem("wb_user", JSON.stringify(fullUser));
          if (data.favorites) setFavorites(data.favorites);
          if (data.wrongWords) setWrongWords(data.wrongWords);
          if (data.moduleStats) setModuleStats(data.moduleStats);
          if (data.practiceHistory) setPracticeHistory(data.practiceHistory);
          window.history.replaceState({}, document.title, "/");
        })
        .catch(() => window.history.replaceState({}, document.title, "/"));
    } else {
      const savedUser = localStorage.getItem("wb_user");
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          if (parsedUser && parsedUser.token) {
            setUser(parsedUser);
            fetch(apiUrl("/api/me"), { headers: { Authorization: parsedUser.token } })
              .then(async (r) => readResponseJson(r))
              .then((me) => {
                if (me && me.user) {
                  const merged = { ...parsedUser, ...me.user, token: parsedUser.token };
                  setUser(merged);
                  localStorage.setItem("wb_user", JSON.stringify(merged));
                  if (me.user.favorites) setFavorites(me.user.favorites);
                  if (me.user.wrongWords) setWrongWords(me.user.wrongWords);
                  if (me.user.moduleStats) setModuleStats(me.user.moduleStats);
                  if (me.user.practiceHistory) setPracticeHistory(me.user.practiceHistory);
                }
              }).catch(() => {});
          }
        } catch { localStorage.removeItem("wb_user"); }
      }
    }
  }, []);

  // Words loading from cache or API
  useEffect(() => {
    const cacheKey = "ydt_words_cache_v2";
    // Safety: force exit loading after 8 seconds no matter what
    const safetyTimer = setTimeout(() => setLoadingWords(false), 8000);
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.words) && Date.now() - parsed.ts < 43200000) {
          setWords(shuffleArray(sanitizeWordList(parsed.words)));
          setLoadingWords(false);
          clearTimeout(safetyTimer);
          return;
        }
      }
    } catch { /**/ }
    fetch(apiUrl('/api/words'))
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const cl = sanitizeWordList(data);
          setWords(shuffleArray(cl));
          try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), words: cl })); } catch { /**/ }
        }
        setLoadingWords(false);
        clearTimeout(safetyTimer);
      })
      .catch(() => { setLoadingWords(false); clearTimeout(safetyTimer); });
    return () => clearTimeout(safetyTimer);
  }, []);

  // Splash exit timing
  useEffect(() => {
    if (!loadingWords) {
      const wait = Math.max(0, 1300 - (Date.now() - splashStartRef.current));
      const t = setTimeout(() => setSplashExiting(true), wait);
      return () => clearTimeout(t);
    }
  }, [loadingWords]);

  useEffect(() => {
    if (splashExiting) {
      console.log("WordBoost: Splash exiting triggered. Finishing in 780ms.");
      const t = setTimeout(() => {
        console.log("WordBoost: Splash DONE. Mounting App UI.");
        setSplashDone(true);
      }, 780);
      return () => clearTimeout(t);
    }
  }, [splashExiting]);

  // Absolute safety: Splash must end eventually
  useEffect(() => {
    const t = setTimeout(() => {
      if (!splashDone) {
        console.warn("WordBoost: EMERGENCY - Forcing splashDone after 15s absolute timeout.");
        setSplashDone(true);
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [splashDone]);

  // Feedback auto-clear
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => { setFeedback(null); setFeedbackMessage(''); }, 1200);
    return () => clearTimeout(t);
  }, [feedback]);

  // Auto-advance in room
  useEffect(() => {
    if (!isInRoom || !isHost || !isAutoAdvance || !practiceWords.length) return;
    const t = setTimeout(() => nextWord(), 15000);
    return () => clearTimeout(t);
  }, [isInRoom, isHost, isAutoAdvance, currentWordIndex, practiceWords.length]);

  // Reset on level change
  useEffect(() => {
    setCurrentWordIndex(0); setIsFlipped(false);
    if (practiceLevel !== "CUSTOM") setCustomDeckWords(null);
  }, [practiceLevel]);

  // LocalStorage persistence
  useEffect(() => {
    localStorage.setItem('ydt_stats', JSON.stringify(stats));
    localStorage.setItem('ydt_wrongWords', JSON.stringify(wrongWords));
    localStorage.setItem('ydt_practiceHistory', JSON.stringify(practiceHistory));
    localStorage.setItem("ydt_moduleStats", JSON.stringify(moduleStats));
    localStorage.setItem("ydt_favorites_bundle", JSON.stringify(favorites));
  }, [stats, wrongWords, practiceHistory, moduleStats, favorites]);

  // Cloud sync debounce
  useEffect(() => {
    if (!user?.token) return;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      fetch(apiUrl('/api/profile/sync'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': user.token },
        body: JSON.stringify({ wrongWords, favorites, moduleStats, practiceHistory })
      }).catch(() => {});
    }, 2500);
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, [wrongWords, favorites, moduleStats, practiceHistory, user]);

  // Socket events
  useEffect(() => {
    socket.on('connect', () => console.log('Socket connected'));
    socket.on('connect_error', () => { setError('Sunucuya bağlanılamıyor'); setLoading(false); });
    socket.on('room-joined', ({ roomCode: rc, users: us, isHost: ih }) => {
      setRoomCode(rc); setUsers(us || []); setIsHost(ih || false); setIsInRoom(true); setError(''); setLoading(false); setCurrentView('room');
    });
    socket.on('user-joined', ({ username: un, socketId }) => {
      setUsers(prev => (prev || []).find(u => u.username === un) ? prev : [...(prev || []), { username: un, socketId }]);
    });
    socket.on('user-left', ({ username: un }) => setUsers(prev => prev.filter(u => u.username !== un)));
    socket.on('sync-stats', ({ stats: ns, users: us }) => { setRoomStats({ ...ns }); if (us) setUsers([...us]); });
    socket.on('sync-word', ({ wordIndex }) => { setCurrentWordIndex(wordIndex); setIsFlipped(false); setShowHint(false); setShowExample(false); });
    socket.on('error', ({ message }) => { setError(message); setLoading(false); });
    return () => {
      socket.off('connect'); socket.off('connect_error'); socket.off('room-joined');
      socket.off('user-joined'); socket.off('user-left'); socket.off('sync-stats'); socket.off('sync-word'); socket.off('error');
    };
  }, []);

  // Admin shortcut & hash nav
  useEffect(() => {
    const onKey = (e) => { if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") { e.preventDefault(); setCurrentView("admin"); window.location.hash = "admin"; } };
    const onHash = () => { if (window.location.hash === "#admin") setCurrentView("admin"); };
    onHash();
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("hashchange", onHash); };
  }, []);

  // URL Popstate
  useEffect(() => {
    const onPop = () => { 
      const v = readInitialViewFromUrl(); 
      setCurrentView(v); 
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Removed history.replaceState loop for safety

  console.log(`WordBoost Render: loadingWords=${loadingWords}, splashExiting=${splashExiting}, splashDone=${splashDone}, currentView=${currentView}`);

  return (
    <ErrorBoundary>
      {!splashDone ? (
        <StartupScreen exiting={splashExiting} />
      ) : (
    <div className="app">
      <header className="header">
        <Navbar 
          currentView={currentView} 
          setCurrentView={setCurrentView}
          user={user}
          onLogoutClick={() => setShowLogoutConfirm(true)}
          onLoginClick={() => setShowLogin(true)}
          siteInfoTab={siteInfoTab}
          onOpenSiteInfo={(tab) => {
            const t = ["features", "about", "privacy", "terms"].includes(tab) ? tab : "features";
            setSiteInfoTab(t);
            setCurrentView("site-info");
          }}
          isInRoom={isInRoom}
          wordsCount={words?.length || 0}
          wrongWordsCount={wrongWords?.length || 0}
          favoritesCount={(favorites?.words?.length || 0) + (favorites?.synonyms?.length || 0) + (favorites?.phrasal?.length || 0)}
        />
    </header>

    <main>
      <Suspense fallback={<div style={{ padding: "50px", textAlign: "center", color: "var(--text-color)" }}>Yükleniyor...</div>}>
      {currentView === 'practice' && (
        <PageWithAds
          isPremium={isUserPremium(user)}
          slotLeft={import.meta.env.VITE_ADSENSE_SLOT_PRACTICE_LEFT}
          slotRight={import.meta.env.VITE_ADSENSE_SLOT_PRACTICE_RIGHT}
          slotBottom={import.meta.env.VITE_ADSENSE_SLOT_PRACTICE_BOTTOM}
        >
          <PracticeView 
            isInRoom={isInRoom}
            stats={stats}
            users={users}
            roomStats={roomStats}
            username={username}
            currentWordIndex={currentWordIndex}
            practiceWords={practiceWords}
            currentWord={currentWord}
            handleAnswer={handleAnswer}
            buttonCooldown={buttonCooldown}
            prevWord={() => setCurrentWordIndex(prev => Math.max(0, prev - 1))}
            nextWord={nextWord}
            resetStats={() => setStats({ studied: 0, known: 0, unknown: 0 })}
            setPracticeLevel={setPracticeLevel}
            practiceLevel={practiceLevel}
            isFlipped={isFlipped}
            flipCard={() => setIsFlipped(!isFlipped)}
            showHint={showHint}
            setShowHint={setShowHint}
            showExample={showExample}
            setShowExample={setShowExample}
            feedback={feedback}
            feedbackMessage={feedbackMessage}
            favorites={favorites.words}
            toggleFavorite={toggleFavorite}
            speakWord={speakWord}
            isHost={isHost}
            isAutoAdvance={isAutoAdvance}
            setIsAutoAdvance={setIsAutoAdvance}
            startCustomPractice={startCustomPractice}
            loadingWords={loadingWords}
          />
        </PageWithAds>
      )}

      {currentView === 'test' && (
        <PageWithAds isPremium={isUserPremium(user)}>
          <TestManager words={words} setCurrentView={setCurrentView} setWrongWords={setWrongWords} />
        </PageWithAds>
      )}

      {currentView === 'dashboard' && (
        <DashboardView 
          stats={stats} 
          words={words}
          practiceHistory={practiceHistory}
          wrongWords={wrongWords}
          moduleStats={moduleStats}
          user={user}
          onLevelSelect={(lvl) => { setPracticeLevel(lvl); setCurrentView('practice'); }}
          onStartCustom={startCustomPractice}
          onViewChange={setCurrentView}
        />
      )}

      {currentView === 'favorites' && (
        <FavoritesView 
          wordFavorites={favorites.words}
          synonymFavorites={favorites.synonyms}
          phrasalFavorites={favorites.phrasal}
          toggleWordFavorite={toggleFavorite}
          toggleSynFavorite={toggleSynFavorite}
          togglePhrasalFavorite={togglePhrasalFavorite}
          currentTab={currentFavTab}
          setCurrentTab={setCurrentFavTab}
        />
      )}

      {currentView === 'word-list' && (
        <WordListView 
          words={uniqueWords} 
          searchTerm={searchTerm} 
          setSearchTerm={setSearchTerm} 
          filteredWords={filteredWords}
          favorites={favorites.words}
          toggleFavorite={toggleFavorite}
          selectedLevel={selectedLevel}
          setSelectedLevel={setSelectedLevel}
          speakWord={speakWord}
        />
      )}

      {currentView === 'synonyms-list' && (
        <SynonymListView
          words={words}
          level={synListLevel}
          setLevel={setSynListLevel}
          searchTerm={synListSearch}
          setSearchTerm={setSynListSearch}
          favorites={favorites.synonyms}
          toggleFavorite={toggleSynFavorite}
          speakWord={speakWord}
        />
      )}

      {currentView === 'phrasal-list' && (
        <PhrasalListView
          words={words}
          level={phrasalListLevel}
          setLevel={setPhrasalListLevel}
          searchTerm={phrasalListSearch}
          setSearchTerm={setPhrasalListSearch}
          favorites={favorites.phrasal}
          toggleFavorite={togglePhrasalFavorite}
          speakWord={speakWord}
        />
      )}

      {currentView === 'wrong-words' && <WrongWordsView wrongWords={wrongWords} />}

      {currentView === 'ai-writing' && (
        <AiWritingView 
          user={user} 
          onGoPremium={() => setShowPricing(true)} 
          onGoChat={() => setCurrentView('ai-chat')} 
        />
      )}
      
      {currentView === 'ai-chat' && (
        <AiChatView 
          user={user} 
          onGoPremium={() => setShowPricing(true)} 
          onGoWriting={() => setCurrentView('ai-writing')} 
        />
      )}

      {currentView === 'synonyms' && <SynonymsView words={words} playSound={playSound} onTrackAnswer={trackModuleAnswer} />}
      {currentView === 'phrasal-verbs' && <PhrasalVerbsView words={words} playSound={playSound} onTrackAnswer={trackModuleAnswer} />}
      {currentView === 'speaking' && (
        <SpeakingView 
          words={words} 
          playSound={playSound} 
          onTrackAnswer={trackModuleAnswer} 
          favorites={favorites} 
          toggleWordFavorite={toggleFavorite}
          toggleSynFavorite={toggleSynFavorite}
          togglePhrasalFavorite={togglePhrasalFavorite}
        />
      )}
      {currentView === 'classroom' && <ClassroomView user={user} setCurrentView={setCurrentView} startCustomPractice={startCustomPractice} />}
      {currentView === 'pricing' && <PricingPage user={user} onBack={() => setCurrentView('practice')} onGoPremium={() => setShowPricing(true)} />}
      {currentView === 'profile' && <ProfileView user={user} setUser={setUser} logout={onLogout} setCurrentView={setCurrentView} />}
      {currentView === 'public-profile' && <PublicProfileView selectedUser={selectedUser} setCurrentView={setCurrentView} />}
      {currentView === 'leaderboard' && <LeaderboardView user={user} setCurrentView={setCurrentView} setSelectedUser={setSelectedUser} />}
      {currentView === 'matching-game' && <MatchingGameView words={words} setCurrentView={setCurrentView} />}
      {currentView === 'draw-reveal' && (
        <DrawRevealGame 
          words={words} 
          user={user} 
          onUpdateStats={trackModuleAnswer} 
          speakWord={speakWord} 
          favorites={favorites?.words || []} 
          toggleFavorite={toggleFavorite} 
          playSound={playSound}
        />
      )}
      {currentView === 'room-menu' && <RoomMenuView username={username} createRoom={createRoom} joinRoom={joinRoom} loading={loading} error={error} />}
      {currentView === 'room' && <RoomView roomCode={roomCode} users={users} username={username} isHost={isHost} setCurrentView={setCurrentView} leaveRoom={() => setIsInRoom(false)} />}
      {currentView === 'admin' && <AdminPanel setCurrentView={setCurrentView} onLogout={onLogout} />}
      {currentView === "site-info" && (
        <SiteInfoPage
          tab={siteInfoTab}
          onTabChange={(t) => {
            const x = ["features", "about", "privacy", "terms"].includes(t) ? t : "features";
            setSiteInfoTab(x);
          }}
          onBack={() => setCurrentView("practice")}
        />
      )}
      </Suspense>
    </main>

    {showLogin && (
      <LoginModal
        onLogin={(u) => {
          setUser(u);
          localStorage.setItem("wb_user", JSON.stringify(u));
          if (u && u.token) {
            fetch(apiUrl("/api/me"), { headers: { Authorization: u.token } })
              .then(async (r) => readResponseJson(r))
              .then((me) => {
                if (me && me.ok && me.user) {
                  const merged = { ...u, ...me.user, token: u.token };
                  setUser(merged);
                  localStorage.setItem("wb_user", JSON.stringify(merged));
                }
              })
              .catch(() => {});
          }
          setShowLogin(false);
        }}
        onClose={() => setShowLogin(false)}
      />
    )}

    {showPricing && (
      <PricingModal
        user={user}
        onClose={() => setShowPricing(false)}
      />
    )}

    {showLogoutConfirm && (
      <div className="logout-overlay">
        <div className="logout-modal">
          <h3>Çıkış yapmak istediğine emin misin?</h3>
          <div className="logout-buttons">
            <button className="confirm-btn" onClick={onLogout}>Evet, çıkış yap</button>
            <button className="cancel-btn" onClick={() => setShowLogoutConfirm(false)}>Vazgeç</button>
          </div>
        </div>
      </div>
    )}

    {newBadgeNotification && newBadgeNotification.badges && newBadgeNotification.badges.length > 0 && (
      <div className="badge-notification-overlay" onClick={() => setNewBadgeNotification(null)}>
        <div className="badge-notification-modal" onClick={e => e.stopPropagation()}>
          <h3>🎉 Yeni Rozet{newBadgeNotification.badges.length > 1 ? 'ler' : ''} Kazandın!</h3>
          <div className="badge-notification-list">
            {newBadgeNotification.badges.map((b, idx) => {
              if (!b) return null;
              const bId = typeof b === 'string' ? b : (b.id || '');
              const info = BADGES[bId] || { icon: b.icon || '🏆', name: b.name || bId || 'Yeni Rozet', desc: b.desc || '' };
              return (
                <div key={bId || idx} className="badge-notification-item">
                  <span className="badge-notification-icon">{info.icon}</span>
                  <div>
                    <strong>{info.name}</strong>
                    <p>{info.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="badge-notification-btn" onClick={() => setNewBadgeNotification(null)}>
            Tamam
          </button>
        </div>
      </div>
    )}

  </div>
    )}
    <ConsentBanner />
    </ErrorBoundary>
  );
}

export default App;