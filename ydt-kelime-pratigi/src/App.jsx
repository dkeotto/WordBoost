import { useState, useEffect, useMemo, useRef } from "react";
import LoginModal from "./components/LoginModal";
import Navbar from "./components/Navbar";
import { io } from "socket.io-client";
import "./App.css";



const SOCKET_URL = window.location.origin;
const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  timeout: 10000,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

socket.io.on('upgradeError', (err) => {
  console.warn('Socket.IO upgrade error:', err);
});



const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'correct') {
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } else {
      oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(150, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
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
  const saved = localStorage.getItem("ydt_favorites");
  return saved ? JSON.parse(saved) : [];
  
});

const ProfileView = () => {
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

    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
      nickname: user.nickname || user.username,
      bio: user.bio || "",
      avatar: user.avatar || "👤",
      avatarStyle: getStyleFromUrl(user.avatar) 
    });

    const styles = [
      { id: "adventurer", name: "🦸‍♂️ Maceracı", bg: "b6e3f4,c0aede,d1d4f9" },
      { id: "notionists", name: "🎨 Minimalist", bg: "ffe5ec,ffc2d1,ffb3c6" },
      { id: "micah", name: "✨ Modern", bg: "f4e4bc,d1d4f9,b6e3f4" },
      { id: "lorelei", name: "🎭 Sanatsal", bg: "ffdfbf,ffd4c2,ffccb6" },
      { id: "bottts", name: "🤖 Robot", bg: "e0e0e0,cccccc,b3b3b3" },
      { id: "avataaars", name: "🙂 Klasik", bg: "transparent" }
    ];

    const generateAvatar = (style = editForm.avatarStyle) => {
      const seed = Math.random().toString(36).substring(7);
      const bg = styles.find(s => s.id === style)?.bg || "transparent";
      return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&backgroundColor=${bg}`;
    };

    const handleSave = () => {
      fetch('/api/profile/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user.token
        },
        // Sadece avatar URL'sini gönderiyoruz, stil bilgisi URL içinde zaten var
        body: JSON.stringify({
          nickname: editForm.nickname,
          bio: editForm.bio,
          avatar: editForm.avatar
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Token bilgisini koruyarak user state'ini güncelle
          const updatedUser = { ...user, ...data.user, token: user.token };
          setUser(updatedUser);
          // LocalStorage'ı da güncelle
          localStorage.setItem("wb_user", JSON.stringify(updatedUser));
          setIsEditing(false);
        } else {
          alert("Kaydetme başarısız: " + (data.error || "Bilinmeyen hata"));
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
        // Max 5MB
        if (file.size > 5 * 1024 * 1024) {
          alert("Dosya boyutu çok büyük (Max 5MB)");
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          setEditForm(prev => ({
            ...prev,
            avatar: reader.result, // Base64 string
            avatarStyle: "custom" // Custom stil
          }));
        };
        reader.readAsDataURL(file);
      }
    };

    const [avatarConfig, setAvatarConfig] = useState({
      base: "adventurer",
      gender: "neutral", // "male", "female", "neutral"
      hair: "short",     // "short", "long", "curly" etc. (Basitleştirilmiş)
      skin: "light"      // "light", "dark", "yellow" etc.
    });

    const generateCustomAvatar = () => {
      // Gartic.io benzeri basit yapılandırma
      // DiceBear Adventurer parametrelerini kullanarak özelleştirme
      // seed, backgroundColor, skinColor, hair, hairColor vb.
      
      const seed = Math.random().toString(36).substring(7);
      
      // Basit parametreler (DiceBear Adventurer için)
      // Bu stil çok detaylı parametre almaz, seed üzerinden çalışır.
      // Ancak "Avataaars" veya "Bottts" gibi stiller daha fazla parametre alır.
      // Kullanıcı "Gartic.io gibi" dediği için daha manuel bir yapı istiyor.
      // DiceBear'da "Avataaars" stili en çok özelleştirilebilen stildir.
      
      let url = `https://api.dicebear.com/7.x/${avatarConfig.base}/svg?seed=${seed}`;
      
      // Renk ve arka plan ekle
      url += `&backgroundColor=b6e3f4,c0aede,d1d4f9`;
      
      return url;
    };
    
    // YENİ AVATAR OLUŞTURUCU (Gartic.io Tarzı)
    const AvatarBuilder = () => {
      const [seed, setSeed] = useState(user.username);
      const [bg, setBg] = useState("b6e3f4");
      
      const updateAvatar = (newSeed) => {
        setSeed(newSeed);
        setEditForm(prev => ({
          ...prev, 
          avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${newSeed}&backgroundColor=${bg}`
        }));
      };

      return (
        <div className="avatar-builder">
          <div className="builder-controls">
            <button onClick={() => updateAvatar(Math.random().toString(36))} title="Rastgele">🎲</button>
            <div className="color-picker">
              {["b6e3f4","c0aede","d1d4f9","ffdfbf","ffd4c2","ffe5ec"].map(color => (
                <div 
                  key={color} 
                  className={`color-dot ${bg === color ? 'selected' : ''}`} 
                  style={{background: `#${color}`}}
                  onClick={() => {
                    setBg(color);
                    setEditForm(prev => ({
                      ...prev, 
                      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=${color}`
                    }));
                  }}
                />
              ))}
            </div>
          </div>
          <div className="upload-section">
             <label className="upload-text-btn">
               � Kendi Fotoğrafını Yükle
               <input 
                 type="file" 
                 accept="image/*" 
                 onChange={handleFileChange}
                 style={{display: 'none'}} 
               />
             </label>
          </div>
        </div>
      );
    };

    return (
      <div className="profile-view">
        <div className="profile-header">
          <div className="profile-avatar-container">
            <img 
              src={isEditing ? editForm.avatar : user.avatar} 
              alt="Avatar" 
              className="profile-avatar-img"
              onError={(e) => e.target.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.username}&backgroundColor=b6e3f4,c0aede,d1d4f9`}
            />
            {isEditing && <AvatarBuilder />}
          </div>
          
          <div className="profile-info">
            {isEditing ? (
              <input 
                value={editForm.nickname} 
                onChange={e => setEditForm({...editForm, nickname: e.target.value})}
                placeholder="Takma Ad"
              />
            ) : (
              <h2>{user.nickname} <span className="username">(@{user.username})</span></h2>
            )}
            
            {isEditing ? (
              <textarea 
                value={editForm.bio} 
                onChange={e => setEditForm({...editForm, bio: e.target.value})}
                placeholder="Hakkında bir şeyler yaz..."
              />
            ) : (
              <p className="bio">{user.bio || "Henüz biyografi eklenmemiş."}</p>
            )}
          </div>
          
          <button className="edit-btn" onClick={() => isEditing ? handleSave() : setIsEditing(true)}>
            {isEditing ? "Kaydet" : "✏️ Düzenle"}
          </button>
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
                // Badge detaylarını bulmak için bir mapping gerekebilir veya server populate edebilir.
                // Şimdilik server'dan badge ID geliyor, basit bir map yapalım veya server'dan tam obje isteyelim.
                // Server'da BADGES objesi vardı. Frontend'de de tanımlayalım veya id'yi gösterelim.
                return (
                  <div key={badgeId} className="badge-item">
                    <div className="badge-icon">🏆</div>
                    <span>{badgeId}</span>
                  </div>
                );
              })
            ) : (
              <p className="no-badges">Henüz rozet kazanmadın. Çalışmaya başla!</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const [selectedUser, setSelectedUser] = useState(null);

  const PublicProfileView = () => {
    if (!selectedUser) return <div className="loading">Kullanıcı bulunamadı</div>;

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
              selectedUser.badges.map(badgeId => (
                <div key={badgeId} className="badge-item">
                  <div className="badge-icon">🏆</div>
                  <span>{badgeId}</span>
                </div>
              ))
            ) : (
              <p className="no-badges">Henüz rozet kazanmamış.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const LeaderboardView = () => {
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
      // Eğer kendi ismine tıkladıysa, kendi düzenlenebilir profiline git
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

    if (loading) return <div className="loading">Yükleniyor...</div>;

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
          {leaders.map((u, idx) => (
            <div 
              key={idx} 
              className={`lb-item ${user && user.username === u.username ? 'me' : ''}`}
              onClick={() => openProfile(u.username)}
              style={{cursor: 'pointer'}}
            >
              <span className="rank">{idx + 1}</span>
              <div className="user-col">
                <span className="avatar">
                  {u.avatar && u.avatar.startsWith('http') ? (
                    <img src={u.avatar} alt="av" className="lb-avatar-img" />
                  ) : (
                    u.avatar || "👤"
                  )}
                </span>
                <span className="nick">{u.nickname || u.username}</span>
              </div>
              <span className="streak">🔥 {u.streak || 0}</span>
              <span className="score">⭐ {u.stats?.known || 0}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const FavoritesView = () => (
    <div className="word-list">
      <h2>⭐ Favoriler ({favorites.length})</h2>

      {favorites.length === 0 ? (
        <p className="empty">Henüz favori kelime yok.</p>
      ) : (
        <div className="word-grid">
          {favorites.map((word, idx) => (
  <div key={idx} className="word-card">

    <button
      className="fav-btn"
      onClick={() => toggleFavorite(word)}
    >
      ⭐
    </button>

    <h4>{word.term}</h4>
    <p className="meaning">{word.meaning}</p>
    <p className="hint">{word.hint}</p>

  </div>
))}
        </div>
      )}
    </div>
  );

useEffect(() => {
  localStorage.setItem("ydt_favorites", JSON.stringify(favorites));
}, [favorites]);
const toggleFavorite = (word) => {
  setFavorites(prev => {
    const exists = prev.find(w => w.term === word.term);

    if (exists) {
      return prev.filter(w => w.term !== word.term);
    }

    return [...prev, word];
  });
};

const [showLogin, setShowLogin] = useState(false);
const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
const [currentView, setCurrentView] = useState('practice');
const [words, setWords] = useState([]);
const [loadingWords, setLoadingWords] = useState(true);


useEffect(() => {
    // Check for token in URL (Social Login Redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const usernameParam = params.get('username');

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
        setUser(JSON.parse(savedUser));
      }
    }
  }, []);
useEffect(() => {
  fetch('/api/words')
    .then(res => res.json())
    .then(data => {
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      setWords(shuffled);
      setLoadingWords(false);
    })
    .catch(err => {
      console.error(err);
      setLoadingWords(false);
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
  const wrongWordsCount = wrongWords.length; // Add this derived state
  const [buttonCooldown, setButtonCooldown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef(null);
  useEffect(() => {
  if (searchInputRef.current) {
    searchInputRef.current.focus();
  }
}, [searchTerm]);

  const feedbackCounter = useRef(0);
  const [feedback, setFeedback] = useState(null);
  const lastFeedbackRef = useRef({ time: 0, type: null });
  const activeFeedbackRef = useRef(null);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  
  const [testMode, setTestMode] = useState(false);
  const [testWords, setTestWords] = useState([]);
  const [testIndex, setTestIndex] = useState(0);
  const [testOptions, setTestOptions] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [testFinished, setTestFinished] = useState(false);
  const [testWordCount, setTestWordCount] = useState(10);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [retestMode, setRetestMode] = useState(false);
  
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [users, setUsers] = useState([]);
  const [roomStats, setRoomStats] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isInRoom, setIsInRoom] = useState(false);
  const [isHost, setIsHost] = useState(false);

  // Matching Game States
  const [matchingGame, setMatchingGame] = useState(false);
  const [matchingCards, setMatchingCards] = useState([]);
  const [selectedCards, setSelectedCards] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState([]);
  const [moves, setMoves] = useState(0);
  const [gameTime, setGameTime] = useState(0);
  const [gameTimer, setGameTimer] = useState(null);
  const [gameFinished, setGameFinished] = useState(false);

  useEffect(() => {
    localStorage.setItem('ydt_stats', JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    localStorage.setItem('ydt_wrongWords', JSON.stringify(wrongWords));
  }, [wrongWords]);

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

  // Login 
  

  // Matching Game Timer
  useEffect(() => {
    if (matchingGame && !gameFinished && matchedPairs.length < 8) {
      const timer = setInterval(() => {
        setGameTime(prev => prev + 1);
      }, 1000);
      setGameTimer(timer);
      return () => clearInterval(timer);
    }
  }, [matchingGame, gameFinished, matchedPairs.length]);

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

// Matching Game Functions
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
    setCurrentView('matching-game');
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
        // Match found
        playSound('correct');
        setMatchedPairs(prev => [...prev, card.pairId]);
        setSelectedCards([]);
        
        if (matchedPairs.length + 1 === 8) {
          setGameFinished(true);
          if (gameTimer) clearInterval(gameTimer);
        }
      } else {
        // No match
        playSound('wrong');
        setTimeout(() => {
          setSelectedCards([]);
        }, 1000);
      }
    }
  };

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

  const [testType, setTestType] = useState('EN-TR'); // 'EN-TR' or 'TR-EN'

  const startTest = (wordsList = null) => {
    const testCountInput = document.getElementById('test-count-input');
    const countValue = testCountInput ? parseInt(testCountInput.value) : 10;
    const wordSource = wordsList || words;
    
    if (countValue < 5 || countValue > wordSource.length) {
      setError(`Kelime sayısı 5-${wordSource.length} arasında olmalı`);
      return;
    }
    
    setTestWordCount(countValue);
    const shuffled = [...wordSource].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, countValue);
    
    setTestWords(selected);
    setTestIndex(0);
    setTestResults([]);
    setTestFinished(false);
    setTestMode(true);
    setRetestMode(false);
    setShowResult(false);
    setSelectedOption(null);
    
    const options = generateOptions(selected[0], words);
    setTestOptions(options);
  };

  const startRetest = () => {
    const wrongAnswers = testResults.filter(r => !r.correct).map(r => r.word);
    if (wrongAnswers.length === 0) {
      setError('Yanlış yapılan kelime yok!');
      return;
    }
    setRetestMode(true);
    setTestWords(wrongAnswers);
    setTestIndex(0);
    setTestResults([]);
    setTestFinished(false);
    setShowResult(false);
    setSelectedOption(null);
    const options = generateOptions(wrongAnswers[0], words);
    setTestOptions(options);
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
        setTestFinished(true);
      }
    }, 1500);
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
    
    // Geçiş süresi ve cooldown'ı eşitle (800ms)
    // Böylece kelime değişmeden tekrar tıklanamaz
    const transitionDuration = 800;
    triggerCooldown(transitionDuration);
    
    const currentWord = practiceWords[currentWordIndex];
    
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
      if (user && user.token) {
        fetch('/api/stats/update', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': user.token
          },
          body: JSON.stringify({
            studied: 1,
            known: isKnown ? 1 : 0,
            unknown: !isKnown ? 1 : 0
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
              data.newBadges.forEach(b => {
                // Basit bir toast/alert yerine custom bir animasyon eklenebilir
                // Şimdilik alert
                alert(`🎉 YENİ ROZET: ${b.name}\n${b.desc}`);
              });
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

    playSound(isKnown ? 'correct' : 'wrong');
    showFeedbackAnim(isKnown ? 'correct' : 'wrong');
    
    setTimeout(() => {
      nextWord();
    }, transitionDuration);
  };

  const flipCard = () => setIsFlipped(!isFlipped);
  
  const resetStats = () => {
    setStats({ studied: 0, known: 0, unknown: 0 });
    setWrongWords([]);
    localStorage.removeItem('ydt_stats');
    localStorage.removeItem('ydt_wrongWords');
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

  const speakWord = (word) => {
    const utterance = new SpeechSynthesisUtterance(word.term);
    utterance.lang = 'en-US';
    utterance.rate = 0.8; // Hızı biraz yavaşlat (Varsayılan 1)
    window.speechSynthesis.cancel(); // Önceki okumayı durdur
    window.speechSynthesis.speak(utterance);
  };

  const Flashcard = ({ word }) => (
    <div className="flashcard-container">
      {/* Favori ve Level Göstergeleri */}
      <div className="flashcard-level">{word.level || "?"}</div>
      
      <button 
        className="flashcard-speak-btn"
        onClick={(e) => {
          e.stopPropagation();
          speakWord(word);
        }}
        title="Telaffuz"
      >
        🔊
      </button>

      <button 
        className="flashcard-fav-btn"
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(word);
        }}
      >
        {favorites.find(w => w.term === word.term) ? "⭐" : "☆"}
      </button>

      <div className={`flashcard ${isFlipped ? 'flipped' : ''}`} onClick={flipCard}>
        <div className="card-inner">
          <div className="card-front">
            <h2>{word.term}</h2>
            <p className="hint-text">Kartı çevirmek için tıklayın</p>
          </div>
          <div className="card-back">
            <h3>{word.meaning}</h3>
          </div>
        </div>
      </div>
      
      <div className="extra-info-buttons">
        <button 
          className={`info-btn ${showHint ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setShowHint(!showHint); }}
        >
          💡 İpucu
        </button>
        <button 
          className={`info-btn ${showExample ? 'active' : ''}`}
          onClick={(e) => { e.stopPropagation(); setShowExample(!showExample); }}
        >
          📝 Örnek Kullanım
        </button>
      </div>
      
      {(showHint || showExample) && (
        <div className="extra-info-display">
          {showHint && (
            <div className="info-section hint-section">
              <strong>İpucu:</strong> {word.hint}
            </div>
          )}
          {showExample && (
            <div className="info-section example-section">
              <strong>Örnek:</strong> {word.example}
            </div>
          )}
        </div>
      )}
      
      {feedback && (
        <div
          key={feedback.id}
          className={`feedback ${feedback.type}`}
        >
          {feedbackMessage}
        </div>
      )}
    </div>
  );

  const StatsPanel = () => (
    <div className="stats-container">
      <div className="stats">
        <div className="stat">
          <span>Çalışılan</span>
          <strong>{stats.studied}</strong>
        </div>
        <div className="stat known">
          <span>Biliyorum</span>
          <strong>{stats.known}</strong>
        </div>
        <div className="stat unknown">
          <span>Bilmiyorum</span>
          <strong>{stats.unknown}</strong>
        </div>
        <button className="reset-btn" onClick={resetStats}>Sıfırla</button>
      </div>

      {!isInRoom && (
        <div className="level-selector-embedded">
          <label>Çalışma Seviyesi:</label>
          <select 
            value={practiceLevel} 
            onChange={(e) => setPracticeLevel(e.target.value)}
          >
            <option value="ALL">Tümü (Karma)</option>
            <option value="A1-A2">A1 - A2</option>
            <option value="B1-B2">B1 - B2</option>
            <option value="B1-C2">B1 - C2</option>
            <option value="C1-C2">C1 - C2</option>
            <option disabled>──────────</option>
            <option value="A1">Sadece A1</option>
            <option value="A2">Sadece A2</option>
            <option value="B1">Sadece B1</option>
            <option value="B2">Sadece B2</option>
            <option value="C1">Sadece C1</option>
            <option value="C2">Sadece C2</option>
          </select>
        </div>
      )}
    </div>
  );

  const PracticeView = () => (
    <div className="practice">
      <h2>{isInRoom ? '👥 Yarış Modu' : 'Tek Kişilik Kelime Çalışması'}</h2>
      
      <StatsPanel />
      
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
        <Flashcard word={currentWord} />
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

  const MatchingGameView = () => (
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

  const TestSetupView = () => (
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

      <button className="start-test-btn" onClick={() => startTest()}>
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

  const TestView = () => {
    const currentWord = testWords[testIndex];
    const progress = ((testIndex + 1) / testWords.length) * 100;
    
    // Determine question and options based on testType
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
  };

  const TestResultsView = () => {
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
          <button onClick={() => {setTestMode(false); setCurrentView('test-setup');}}>Yeni Test</button>
          <button className="btn-secondary" onClick={() => {setTestMode(false); setCurrentView('practice');}}>Çalışmaya Dön</button>
        </div>
      </div>
    );
  };

  

      const WrongWordsView = () => (
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
  

  const RoomMenuView = () => (
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
          defaultValue={joinCode}
          maxLength={6}
          style={{width: '100%', padding: '15px'}}
        />
        <button onClick={joinRoom}>🚪 Odaya Katıl</button>
      </div>
    </div>
  );

  const RoomView = () => {
    useEffect(() => {
      setError('');
    }, []);

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
if (loadingWords) {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
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
          favoritesCount={favorites.length}
          setTestMode={setTestMode}
          setMatchingGame={setMatchingGame}
        />
    </header>

    <main>
      {!testMode && currentView === 'practice' && <PracticeView />}
      {!testMode && currentView === 'test-setup' && <TestSetupView />}
      {testMode && !testFinished && <TestView />}
      {testMode && testFinished && <TestResultsView />}
      {currentView === 'favorites' && <FavoritesView />}
      {currentView === 'matching-game' && <MatchingGameView />}
      {currentView === 'profile' && <ProfileView />}
      {currentView === 'public-profile' && <PublicProfileView />}
      {currentView === 'leaderboard' && <LeaderboardView />}
      {currentView === 'word-list' && (
        <WordListView
          words={uniqueWords}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          filteredWords={filteredWords}
          favorites={favorites}
          toggleFavorite={toggleFavorite}
          selectedLevel={selectedLevel}
          setSelectedLevel={setSelectedLevel}
          speakWord={speakWord}
        />
      )}
      {currentView === 'wrong-words' && <WrongWordsView />}
      {currentView === 'room-menu' && <RoomMenuView />}
      {currentView === 'room' && <RoomView />}
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
            <button
              onClick={() => {
                setUser(null);
                localStorage.removeItem("wb_user");
                setShowLogoutConfirm(false);
              }}
            >
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

  </div>
);
}
function WordListView({
  words,
  searchTerm,
  setSearchTerm,
  filteredWords,
  selectedLevel,
  setSelectedLevel,
  favorites,
  toggleFavorite,
  speakWord
}) {
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
}

export default App;