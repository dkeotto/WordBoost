import { useState, useEffect, useMemo } from "react";
import LoginModal from "./components/LoginModal";
import AdminPanel from "./components/AdminPanel";
import Navbar from "./components/Navbar";
import Flashcard from "./components/Flashcard";
import StatsPanel from "./components/StatsPanel";
import AvatarBuilder from "./components/AvatarBuilder";
import DashboardView from "./components/DashboardView";
import SynonymsView from "./components/SynonymsView";
import PhrasalVerbsView from "./components/PhrasalVerbsView";
import { sanitizeWordList } from "./utils/wordQuality";
import { buildSynonymQuestionPool, buildPhrasalQuestionPool } from "./utils/questionGenerators";
import { io } from "socket.io-client";
import "./App.css";


const SOCKET_URL = window.location.origin;

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
  weekend_warrior: { id: 'weekend_warrior', icon: '🎉', name: 'Hafta Sonu Savaşçısı', desc: 'Hafta sonu çalışmayı ihmal etmedin.' }
};

const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  timeout: 10000,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
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
      if (!options.find(o => o.term === wrongWord.term)) {
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

const PracticeView = ({ 
    isInRoom, stats, users, roomStats, username, 
    currentWordIndex, practiceWords, currentWord, 
    handleAnswer, buttonCooldown, prevWord, nextWord, 
    resetStats, setPracticeLevel, practiceLevel,
    isFlipped, flipCard, showHint, setShowHint, showExample, setShowExample, 
    feedback, feedbackMessage, favorites, toggleFavorite, speakWord 
  }) => (
    <div className="practice">
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
        {filteredWords.map((word, idx) => (
          <div key={word.term} className="word-card">
            <button
              className="fav-btn"
              onClick={() => toggleFavorite(word)}
            >
              {favorites.find(w => w.term === word.term) ? "⭐" : "☆"}
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

const SynonymListView = ({ items, level, setLevel, searchTerm, setSearchTerm, favorites, toggleFavorite, speakWord }) => {
  const filtered = items.filter((q) => {
    const byLevel = level === "ALL" || q.level === level;
    const qText = `${q.question} ${q.correct} ${q.meaning || ""}`.toLowerCase();
    const bySearch = !searchTerm || qText.includes(searchTerm.toLowerCase());
    return byLevel && bySearch;
  });
  return (
    <div className="word-list">
      <h2>Synonyms Listesi ({filtered.length})</h2>
      <div className="search-box">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Synonym ara..." />
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ALL">ALL</option><option value="A1">A1</option><option value="A2">A2</option>
          <option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option><option value="C2">C2</option>
        </select>
      </div>
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

const PhrasalListView = ({ items, level, setLevel, searchTerm, setSearchTerm, favorites, toggleFavorite, speakWord }) => {
  const filtered = items.filter((q) => {
    const byLevel = level === "ALL" || q.level === level;
    const qText = `${q.base} ${q.correct} ${q.meaning || ""}`.toLowerCase();
    const bySearch = !searchTerm || qText.includes(searchTerm.toLowerCase());
    return byLevel && bySearch;
  });
  return (
    <div className="word-list">
      <h2>Phrasal Verbs Listesi ({filtered.length})</h2>
      <div className="search-box">
        <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Phrasal ara..." />
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="ALL">ALL</option><option value="A1">A1</option><option value="A2">A2</option>
          <option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option><option value="C2">C2</option>
        </select>
      </div>
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

const ProfileView = ({ user, setUser, logout, setCurrentView }) => {
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
        const res = await fetch('/api/profile', {
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

      fetch('/api/profile/update', {
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
      .then(res => res.json())
      .then(data => {
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
        alert("Bağlantı hatası!");
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
              {isEditing ? (
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px', width: '100%'}}>
                   <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                     <div style={{flex:1}}>
                       <label style={{fontSize: '0.8rem', color: '#888'}}>Takma Ad</label>
                       <input 
                        value={editForm.nickname} 
                        onChange={e => setEditForm({...editForm, nickname: e.target.value})}
                        placeholder="Takma Ad"
                        style={{width: '100%'}}
                      />
                     </div>
                     <div style={{flex:1}}>
                       <label style={{fontSize: '0.8rem', color: '#888'}}>Kullanıcı Adı (@)</label>
                       <input 
                        value={editForm.username} 
                        onChange={e => setEditForm({...editForm, username: e.target.value})}
                        placeholder="Kullanıcı Adı"
                        style={{width: '100%'}}
                      />
                     </div>
                   </div>
                </div>
              ) : (
                <h2>{user.nickname} <span className="username">(@{user.username})</span></h2>
              )}

              <div style={{display: 'flex', alignItems: 'center', marginLeft: 'auto'}}>
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
              <p className="bio">{user.bio || "Henüz biyografi eklenmemiş."}</p>
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
    const joinedDays = selectedUser.createdAt
      ? Math.max(1, Math.floor((Date.now() - new Date(selectedUser.createdAt).getTime()) / 86400000))
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
            <h2>{selectedUser.nickname} <span className="username">(@{selectedUser.username})</span></h2>
            <p className="bio">{selectedUser.bio || "Henüz biyografi eklenmemiş."}</p>
            <p className="join-date">Katılım: {new Date(selectedUser.createdAt).toLocaleDateString('tr-TR')}</p>
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
      fetch('/api/leaderboard')
        .then(res => res.json())
        .then(data => {
          setLeaders(data);
          setLoading(false);
        });
    }, []);

    const handleSearch = (e) => {
      const q = e.target.value;
      setSearchQuery(q);
      
      if (q.length > 2) {
        fetch(`/api/users/search?q=${q}`)
          .then(res => res.json())
          .then(data => setSearchResults(data));
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
      fetch(`/api/users/${targetUsername}`)
        .then(res => res.json())
        .then(data => {
          setSelectedUser(data);
          setCurrentView('public-profile');
          setLoading(false);
        })
        .catch(() => {
          alert("Kullanıcı profili yüklenemedi");
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
                  <span>{u.nickname || u.username}</span>
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
    const [gameTimer, setGameTimer] = useState(null);
    const [gameFinished, setGameFinished] = useState(false);

    useEffect(() => {
        if (matchingGame && !gameFinished && matchedPairs.length < 8) {
          const timer = setInterval(() => {
            setGameTime(prev => prev + 1);
          }, 1000);
          setGameTimer(timer);
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
        if (selectedCards.length === 2 || selectedCards.find(c => c.id === card.id) || matchedPairs.includes(card.pairId)) {
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
              if (gameTimer) clearInterval(gameTimer);
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
                  const isSelected = selectedCards.find(c => c.id === card.id);
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
            if (!prev.find(w => w.term === currentWord.term)) {
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

  const [selectedLevel,setSelectedLevel] = useState("ALL")
  const [practiceLevel, setPracticeLevel] = useState("ALL");

  const loadFromStorage = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(`ydt_${key}`);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  };
  const [user, setUser] = useState(null);

  const [favorites, setFavorites] = useState(() => {
    const savedBundle = localStorage.getItem("ydt_favorites_bundle");
    if (savedBundle) return JSON.parse(savedBundle);
    const legacy = localStorage.getItem("ydt_favorites");
    return {
      words: legacy ? JSON.parse(legacy) : [],
      synonyms: [],
      phrasal: [],
    };
  });

  const logout = () => {
    setUser(null);
    localStorage.removeItem("wb_user");
    setShowLogoutConfirm(false);
    setCurrentView('practice'); 
    window.location.reload(); 
  };

  const [showLogin, setShowLogin] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [newBadgeNotification, setNewBadgeNotification] = useState(null); // { badges: [{ id }] }
  const [currentView, setCurrentView] = useState('practice');
  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(true);


  useEffect(() => {
    // Check for token in URL (Social Login Redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const usernameParam = params.get('username');
    const errorParam = params.get('error');

    if (errorParam) {
      if (errorParam === 'auth_cancel') {
        alert("Giriş iptal edildi.");
      } else {
        alert("Giriş sırasında bir hata oluştu: " + errorParam + "\nLütfen tekrar deneyin.");
      }
      window.history.replaceState({}, document.title, "/");
      return;
    }

    if (token && usernameParam) {
      // Save token
      const userObj = { username: usernameParam, token }; // Minimal user obj
      localStorage.setItem("wb_user", JSON.stringify(userObj));
      
      // Fetch full profile
      fetch('/api/profile', {
        headers: { 'Authorization': token }
      })
      .then(res => res.json())
      .then(data => {
        const fullUser = { ...data, token };
        setUser(fullUser);
        localStorage.setItem("wb_user", JSON.stringify(fullUser));
        // Clear URL
        window.history.replaceState({}, document.title, "/");
      })
      .catch(err => console.error("Profile fetch error:", err));
    } else {
      const savedUser = localStorage.getItem("wb_user");
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          // Token kontrolü: Eğer token yoksa oturumu geçersiz say
          if (parsedUser && parsedUser.token) {
            setUser(parsedUser);
          } else {
            console.warn("Found user in storage but no token. Clearing.");
            localStorage.removeItem("wb_user");
            setUser(null);
          }
        } catch (e) {
          console.error("Storage parse error", e);
          localStorage.removeItem("wb_user");
        }
      }
    }
  }, []);

  useEffect(() => {
    // 10 saniyelik zaman aşımı
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    fetch('/api/words', { signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          const cleaned = sanitizeWordList(data);
          const shuffled = [...cleaned].sort(() => Math.random() - 0.5);
          setWords(shuffled);
        } else {
          console.error("API'den beklenen veri gelmedi:", data);
          setWords([]); // Boş array set et
        }
        setLoadingWords(false);
      })
      .catch(err => {
        console.error("Kelime yükleme hatası:", err);
        setLoadingWords(false); // Hata olsa bile loading'i kapat
      })
      .finally(() => {
        clearTimeout(timeoutId);
      });
  }, []);
  const practiceWords = useMemo(() => {
    let filtered = words;
    
    if (practiceLevel !== "ALL") {
      if (practiceLevel.includes("-")) {
        // Range Logic (e.g. A1-A2)
        const levels = [];
        if (practiceLevel === "A1-A2") levels.push("A1", "A2");
        if (practiceLevel === "B1-B2") levels.push("B1", "B2");
        if (practiceLevel === "B1-C2") levels.push("B1", "B2", "C1", "C2");
        if (practiceLevel === "C1-C2") levels.push("C1", "C2");
        
        filtered = words.filter(w => levels.includes(w.level));
      } else {
        filtered = words.filter(w => w.level === practiceLevel);
      }
    }
    
    // Shuffle filtered words on level change
    return [...filtered].sort(() => Math.random() - 0.5);
  }, [words, practiceLevel]);

  // Use practiceWords for index management
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const currentWord = practiceWords[currentWordIndex];

  // Reset index when level changes
  useEffect(() => {
    setCurrentWordIndex(0);
    setIsFlipped(false);
  }, [practiceLevel]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [stats, setStats] = useState(() => loadFromStorage('stats', { studied: 0, known: 0, unknown: 0 }));
  const [wrongWords, setWrongWords] = useState(() => loadFromStorage('wrongWords', []));
  const [practiceHistory, setPracticeHistory] = useState(() => loadFromStorage('practiceHistory', []));
  const [moduleStats, setModuleStats] = useState(() =>
    loadFromStorage("moduleStats", {
      synonyms: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
      phrasal: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
    })
  );
  const wrongWordsCount = wrongWords.length; // Add this derived state
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

  useEffect(() => {
    localStorage.setItem('ydt_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('ydt_wrongWords', JSON.stringify(wrongWords));
  }, [wrongWords]);

  useEffect(() => {
    localStorage.setItem('ydt_practiceHistory', JSON.stringify(practiceHistory));
  }, [practiceHistory]);

  useEffect(() => {
    localStorage.setItem("ydt_moduleStats", JSON.stringify(moduleStats));
  }, [moduleStats]);

  useEffect(() => {
    localStorage.setItem("ydt_favorites_bundle", JSON.stringify(favorites));
  }, [favorites]);

  const trackModuleAnswer = (moduleName, isCorrect, level) => {
    setModuleStats((prev) => {
      const current = prev[moduleName] || {
        attempted: 0,
        correct: 0,
        wrong: 0,
        streak: 0,
        bestStreak: 0,
        byLevel: {},
      };
      const nextStreak = isCorrect ? current.streak + 1 : 0;
      const currentLevel = current.byLevel[level] || { attempted: 0, correct: 0, wrong: 0 };
      return {
        ...prev,
        [moduleName]: {
          ...current,
          attempted: current.attempted + 1,
          correct: isCorrect ? current.correct + 1 : current.correct,
          wrong: !isCorrect ? current.wrong + 1 : current.wrong,
          streak: nextStreak,
          bestStreak: Math.max(current.bestStreak, nextStreak),
          byLevel: {
            ...current.byLevel,
            [level]: {
              attempted: currentLevel.attempted + 1,
              correct: isCorrect ? currentLevel.correct + 1 : currentLevel.correct,
              wrong: !isCorrect ? currentLevel.wrong + 1 : currentLevel.wrong,
            },
          },
        },
      };
    });
  };

  useEffect(() => {
    socket.on('connect_error', (err) => {
      console.error('Socket bağlantı hatası:', err);
      setError('Sunucuya bağlanılamıyor');
      setLoading(false);
    });

    socket.on('connect', () => {
      console.log('Socket bağlandı:', socket.id);
    });

    socket.on('room-joined', ({ roomCode, users, isHost: hostStatus }) => {
      setRoomCode(roomCode);
      setUsers(users || []);
      setIsHost(hostStatus || false);
      setIsInRoom(true);
      setError('');
      setLoading(false);
      setCurrentView('room');
    });

    socket.on('user-joined', ({ username, socketId }) => {
      setUsers(prev => {
        if (!prev.find(u => u.username === username)) {
          return [...prev, { username, socketId }];
        }
        return prev;
      });
    });

    socket.on('user-left', ({ username }) => {
      setUsers(prev => prev.filter(u => u.username !== username));
    });

    socket.on('sync-stats', ({ stats: newStats, users }) => {

  setRoomStats({ ...newStats });

  if (users) {
    setUsers([...users]);
  }

});

    socket.on('sync-word', ({ wordIndex }) => {
      setCurrentWordIndex(wordIndex);
      setIsFlipped(false);
      setShowHint(false);
      setShowExample(false);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setLoading(false);
    });

    return () => {
      socket.off('connect_error');
      socket.off('connect');
      socket.off('room-joined');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('sync-stats');
      socket.off('sync-word');
      socket.off('error');
    };
  }, []);

  const uniqueWords = useMemo(() => {
  return [...new Map(words.map(w => [w.term, w])).values()];
}, [words]);

const filteredWords = useMemo(() => {

 let result = uniqueWords;

 // LEVEL FILTER
 if (selectedLevel !== "ALL") {
   result = result.filter(w => w.level === selectedLevel);
 }

 // SEARCH FILTER
 if (searchTerm) {
   result = result.filter(w =>
     w.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
     w.meaning.toLowerCase().includes(searchTerm.toLowerCase())
   );
 }

return result.sort((a,b)=>a.term.localeCompare(b.term));

}, [uniqueWords, searchTerm, selectedLevel]);

const synonymQuestions = useMemo(() => buildSynonymQuestionPool(words), [words]);
const phrasalQuestions = useMemo(() => buildPhrasalQuestionPool(words), [words]);

  const createRoom = async () => {
    const usernameInput = document.getElementById('username-input');
    const usernameValue = usernameInput ? usernameInput.value.trim() : '';
    
    if (!usernameValue) {
      setError('Lütfen kullanıcı adı girin');
      return;
    }
    
    setLoading(true);
    setError('');
    setUsername(usernameValue);
    
    try {
      
      socket.emit('create-room', {
  username: usernameValue
}, (data) => {

  if (!data.success) {
    setError(data.error);
    return;
  }

  setRoomCode(data.roomCode);

  // 🔥 ÖNEMLİ KISIM
  setUsers(data.users || []);
  setRoomStats(data.stats || {});

  setIsHost(true);
  setIsInRoom(true);

  setCurrentView('room');
});
      
      setIsInRoom(true);
      setIsHost(true);
      setCurrentView('room');
      
    } catch (err) {
      setError(`Hata: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = () => {
    const usernameInput = document.getElementById('username-input');
    const joinCodeInput = document.getElementById('joincode-input');
    const usernameValue = usernameInput ? usernameInput.value.trim() : '';
    const codeValue = joinCodeInput ? joinCodeInput.value.trim() : '';
    
    if (!usernameValue) {
      setError('Lütfen kullanıcı adı girin');
      return;
    }
    if (!codeValue || codeValue.length !== 6) {
      setError('Lütfen geçerli 6 haneli oda kodu girin');
      return;
    }
    
    setLoading(true);
    setError('');
    setUsername(usernameValue);
    setJoinCode(codeValue);
    
    socket.emit(
  'join-room',
  { roomCode: codeValue, username: usernameValue },
  (response) => {

    if (!response.success) {
      setError(response.error);
      setLoading(false);
      return;
    }

    setRoomCode(response.roomCode);
    setUsers(response.users || []);
    setRoomStats(response.stats || {});
    setIsHost(response.isHost || false);

    setIsInRoom(true);
    setCurrentView('room');
    setLoading(false);
  }
);
    setTimeout(() => {
      setIsInRoom(true);
      setCurrentView('room');
      setLoading(false);
    }, 500);
  };

  const triggerCooldown = (duration = 800) => {
    setButtonCooldown(true);
    setTimeout(() => setButtonCooldown(false), duration);
  };

  const showFeedbackAnim = (type) => {

  const correctMessages = [
    "🔥 Aferin!",
    "⚡ Süper!",
    "🚀 İyi gidiyorsun!",
    "💪 Harika!",
    "🎯 Tam isabet!",
    "👏 Çok iyi!"
  ];

  const wrongMessages = [
    "📚 Öğreniyoruz",
    "💡 Çalışmaya devam",
    "🧠 Yeni kelime öğrendin",
    "📖 Bir dahaki sefere",
    "🔁 Tekrar edeceğiz",
    "✨ Sorun değil!"
  ];

  const list = type === "correct" ? correctMessages : wrongMessages;

  setFeedbackMessage(list[Math.floor(Math.random() * list.length)]);

  const id = Date.now();   // önemli
  setFeedback({ type, id });

  setTimeout(() => {
  setFeedback(null);
}, 800);
};

  const nextWord = () => {
    if (currentWordIndex < practiceWords.length - 1) {
      const newIndex = currentWordIndex + 1;
      setCurrentWordIndex(newIndex);
      setIsFlipped(false);
      setShowHint(false);
      setShowExample(false);
      
      if (isInRoom) {
        socket.emit('change-word', { roomCode, wordIndex: newIndex });
      }
    }
  };

  const prevWord = () => {
    if (currentWordIndex > 0) {
      const newIndex = currentWordIndex - 1;
      setCurrentWordIndex(newIndex);
      setIsFlipped(false);
      setShowHint(false);
      setShowExample(false);
      
      if (isInRoom) {
        socket.emit('change-word', { roomCode, wordIndex: newIndex });
      }
    }
  };

  const handleAnswer = (isKnown) => {
    if (buttonCooldown) return;
    
    const currentWord = practiceWords[currentWordIndex];
    
    // SAFEGUARD: Eğer kelime yoksa işlemi durdur (Crash önleyici)
    if (!currentWord) return;

    // Geçiş süresi ve cooldown'ı eşitle (800ms)
    const transitionDuration = 800;
    triggerCooldown(transitionDuration);
    
    // SAFEGUARD: Eğer kullanıcı yoksa veya token yoksa sadece lokalde güncelle
    const hasToken = user && user.token;

    if (isInRoom && roomCode) {
      socket.emit('update-stats', {
        roomCode,
        username,
        studied: 1,
        known: isKnown ? 1 : 0,
        unknown: !isKnown ? 1 : 0
      });
    } else {
      // Local State Update
      setStats(prev => ({
        studied: prev.studied + 1,
        known: isKnown ? prev.known + 1 : prev.known,
        unknown: !isKnown ? prev.unknown + 1 : prev.unknown
      }));

      // Server Update (If Logged In)
      if (hasToken) {
        fetch('/api/stats/update', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': user.token
          },
          body: JSON.stringify({
            studied: 1,
            known: isKnown ? 1 : 0,
            unknown: !isKnown ? 1 : 0,
            wordTerm: currentWord.term
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setUser(prev => ({
              ...prev,
              stats: data.stats,
              streak: data.streak,
              badges: data.badges
            }));
            
            if (data.newBadges && data.newBadges.length > 0) {
              setNewBadgeNotification({ badges: data.newBadges });
            }
          }
        })
        .catch(err => console.error("Stats update failed:", err));
      }
    }

    if (!isKnown) {
      setWrongWords(prev => {
        if (!prev.find(w => w.term === currentWord.term)) {
          return [...prev, currentWord];
        }
        return prev;
      });
    }

    setPracticeHistory((prev) => {
      const next = [
        ...prev,
        {
          term: currentWord.term,
          level: currentWord.level || "?",
          isKnown,
          date: new Date().toISOString()
        }
      ];
      return next.slice(-5000);
    });

    playSound(isKnown ? 'correct' : 'wrong');
    showFeedbackAnim(isKnown ? 'correct' : 'wrong');
    
    setTimeout(() => {
      nextWord();
    }, transitionDuration);
  };

  const toggleFavorite = (word) => {
    const exists = favorites.words.find(w => w.term === word.term);
    let newFavs;
    if (exists) {
      newFavs = favorites.words.filter(w => w.term !== word.term);
    } else {
      newFavs = [...favorites.words, word];
    }
    setFavorites((prev) => ({ ...prev, words: newFavs }));
  };

  const toggleSynFavorite = (key) => {
    setFavorites((prev) => ({
      ...prev,
      synonyms: prev.synonyms.includes(key) ? prev.synonyms.filter((x) => x !== key) : [...prev.synonyms, key],
    }));
  };

  const togglePhrasalFavorite = (key) => {
    setFavorites((prev) => ({
      ...prev,
      phrasal: prev.phrasal.includes(key) ? prev.phrasal.filter((x) => x !== key) : [...prev.phrasal, key],
    }));
  };

  const flipCard = () => setIsFlipped(!isFlipped);
  
  const resetStats = () => {
    setStats({ studied: 0, known: 0, unknown: 0 });
    setWrongWords([]);
    setPracticeHistory([]);
    setModuleStats({
      synonyms: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
      phrasal: { attempted: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0, byLevel: {} },
    });
    localStorage.removeItem('ydt_stats');
    localStorage.removeItem('ydt_wrongWords');
    localStorage.removeItem('ydt_practiceHistory');
    localStorage.removeItem("ydt_moduleStats");
  };

  const leaveRoom = () => {
    socket.emit('leave-room', { roomCode, username });
    setIsInRoom(false);
    setIsHost(false);
    setRoomCode('');
    setUsers([]);
    setRoomStats({});
    setCurrentView('practice');
  };

if (loadingWords) {
  return (
    <div className="loading-screen">
      Kelime yükleniyor...
    </div>
  );
}
  return (
    <div className="app">
      <header className="header">
        <Navbar 
          currentView={currentView} 
          setCurrentView={setCurrentView}
          user={user}
          onLogoutClick={() => setShowLogoutConfirm(true)}
          onLoginClick={() => setShowLogin(true)}
          isInRoom={isInRoom}
          wordsCount={words.length}
          wrongWordsCount={wrongWordsCount}
          favoritesCount={favorites.words.length + favorites.synonyms.length + favorites.phrasal.length}
        />
    </header>

    <main>
      {currentView === 'practice' && (
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
          prevWord={prevWord}
          nextWord={nextWord}
          resetStats={resetStats}
          setPracticeLevel={setPracticeLevel}
          practiceLevel={practiceLevel}
          isFlipped={isFlipped}
          flipCard={flipCard}
          showHint={showHint}
          setShowHint={setShowHint}
          showExample={showExample}
          setShowExample={setShowExample}
          feedback={feedback}
          feedbackMessage={feedbackMessage}
          favorites={favorites.words}
          toggleFavorite={toggleFavorite}
          speakWord={speakWord}
        />
      )}
      {currentView === 'test' && <TestManager words={words} setCurrentView={setCurrentView} setWrongWords={setWrongWords} />}
      {currentView === 'favorites' && (
        <FavoritesView
          wordFavorites={favorites.words}
          synonymFavorites={favorites.synonyms}
          phrasalFavorites={favorites.phrasal}
          toggleWordFavorite={toggleFavorite}
          toggleSynFavorite={toggleSynFavorite}
          togglePhrasalFavorite={togglePhrasalFavorite}
        />
      )}
      {currentView === 'matching-game' && <MatchingGameView words={words} setCurrentView={setCurrentView} />}
      {currentView === 'profile' && <ProfileView user={user} setUser={setUser} logout={logout} setCurrentView={setCurrentView} />}
      {currentView === 'public-profile' && <PublicProfileView selectedUser={selectedUser} setCurrentView={setCurrentView} />}
      {currentView === 'leaderboard' && <LeaderboardView user={user} setCurrentView={setCurrentView} setSelectedUser={setSelectedUser} />}
      {currentView === 'dashboard' && (
        <DashboardView
          stats={stats}
          practiceHistory={practiceHistory}
          wrongWords={wrongWords}
          moduleStats={moduleStats}
        />
      )}
      {currentView === 'synonyms' && <SynonymsView words={words} playSound={playSound} onTrackAnswer={trackModuleAnswer} />}
      {currentView === 'phrasal-verbs' && <PhrasalVerbsView words={words} playSound={playSound} onTrackAnswer={trackModuleAnswer} />}
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
          items={synonymQuestions}
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
          items={phrasalQuestions}
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
      {currentView === 'room-menu' && <RoomMenuView username={username} createRoom={createRoom} joinRoom={joinRoom} loading={loading} error={error} />}
      {currentView === 'room' && <RoomView roomCode={roomCode} users={users} username={username} isHost={isHost} setCurrentView={setCurrentView} leaveRoom={leaveRoom} />}
      {currentView === 'admin' && <AdminPanel setCurrentView={setCurrentView} />}
    </main>

    {showLogin && (
      <LoginModal
        onLogin={(u) => {
          setUser(u);
          localStorage.setItem("wb_user", JSON.stringify(u));
          setShowLogin(false);
        }}
        onClose={() => setShowLogin(false)}
      />
    )}

    {showLogoutConfirm && (
      <div className="logout-overlay">
        <div className="logout-modal">
          <h3>Çıkış yapmak istediğine emin misin?</h3>
          <div className="logout-buttons">
            <button onClick={logout}>
              Evet, çıkış yap
            </button>
            <button
              className="cancel-btn"
              onClick={() => setShowLogoutConfirm(false)}
            >
              Vazgeç
            </button>
          </div>
        </div>
      </div>
    )}

    {newBadgeNotification && newBadgeNotification.badges && newBadgeNotification.badges.length > 0 && (
      <div className="badge-notification-overlay" onClick={() => setNewBadgeNotification(null)}>
        <div className="badge-notification-modal" onClick={e => e.stopPropagation()}>
          <h3>🎉 Yeni Rozet{newBadgeNotification.badges.length > 1 ? 'ler' : ''} Kazandın!</h3>
          <div className="badge-notification-list">
            {newBadgeNotification.badges.map(b => {
              const info = BADGES[b.id] || { icon: b.icon || '🏆', name: b.name || b.id, desc: b.desc || '' };
              return (
                <div key={b.id} className="badge-notification-item">
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
);
}

export default App;