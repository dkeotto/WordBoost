import { useState, useEffect, useMemo, useRef } from "react";
import LoginModal from "./components/LoginModal";
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
  const savedUser = localStorage.getItem("wb_user");

  if (savedUser) {
    setUser(JSON.parse(savedUser));
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
  const sortedWordsList = useMemo(() => {
  return [...words].sort((a, b) => a.term.localeCompare(b.term));
}, [words]);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [stats, setStats] = useState(() => loadFromStorage('stats', { studied: 0, known: 0, unknown: 0 }));
  const [wrongWords, setWrongWords] = useState(() => loadFromStorage('wrongWords', []));
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

  if (!searchTerm) return uniqueWords;

  return uniqueWords.filter(w =>
    w.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.meaning.toLowerCase().includes(searchTerm.toLowerCase())
  );

}, [uniqueWords, searchTerm]);

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

  const triggerCooldown = () => {
    setButtonCooldown(true);
    setTimeout(() => setButtonCooldown(false), 500);
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
}, 500);
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
    if (currentWordIndex < words.length - 1) {
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
    
    triggerCooldown();
    const currentWord = words[currentWordIndex];
    
    if (isInRoom && roomCode) {

  socket.emit('update-stats', {
    roomCode,
    username,
    studied: 1,
    known: isKnown ? 1 : 0,
    unknown: !isKnown ? 1 : 0
  });

} else {

  setStats(prev => ({
    studied: prev.studied + 1,
    known: isKnown ? prev.known + 1 : prev.known,
    unknown: !isKnown ? prev.unknown + 1 : prev.unknown
  }));

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
    }, 1000);
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

  
  const Navigation = () => (
    <nav className="nav">
      <button className={currentView === 'practice' && !testMode ? 'active' : ''} onClick={() => {setCurrentView('practice'); setTestMode(false); setMatchingGame(false);}}>
        📝 Kelime Çalışması
      </button>
      <button className={currentView === 'test-setup' || (testMode && !testFinished) ? 'active' : ''} onClick={() => {setCurrentView('test-setup'); setTestMode(false); setMatchingGame(false);}}>
        🎯 Test Modu
      </button>
      <button className={currentView === 'matching-game' ? 'active' : ''} onClick={startMatchingGame}>
        🎮 Eşleştirme
      </button>
      <button className={currentView === 'word-list' ? 'active' : ''} onClick={() => setCurrentView('word-list')}>
        📚 Tüm Kelimeler ({words.length})
      </button>
      <button className={currentView === 'wrong-words' ? 'active' : ''} onClick={() => setCurrentView('wrong-words')}>
        ❌ Yanlışlar ({wrongWords.length})
      </button>
      
      <button className={currentView === 'room-menu' || isInRoom ? 'active' : ''} onClick={() => isInRoom ? setCurrentView('room') : setCurrentView('room-menu')}>
        👥 Oda {isInRoom && '(Aktif)'}
      </button>
      <button
  className={currentView === 'favorites' ? 'active' : ''}
  onClick={() => setCurrentView('favorites')}
>
  ⭐ Favoriler ({favorites.length})
</button>
      {user ? (
  <button
    className="profile-btn"
    onClick={() => setShowLogoutConfirm(true)}
  >
    👤 {user.username}
  </button>
) : (
  <button onClick={() => setShowLogin(true)}>
    🔐 Login
  </button>
  
)}
      </nav>
  );

  const Flashcard = ({ word }) => (
    <div className="flashcard-container">
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
  Kelime {currentWordIndex + 1} / {words.length}
</div>

{words.length > 0 && words[currentWordIndex] && (
  <Flashcard word={words[currentWordIndex]} />
)}
      <div className="controls">
        <button className="btn-prev" onClick={prevWord} disabled={currentWordIndex === 0 || buttonCooldown}>← Önceki</button>
        <div className="answer-buttons">
          <button className="btn-unknown" onClick={() => handleAnswer(false)} disabled={buttonCooldown}>✗ Bilmiyorum</button>
          <button className="btn-known" onClick={() => handleAnswer(true)} disabled={buttonCooldown}>✓ Biliyorum</button>
        </div>
        <button className="btn-next" onClick={nextWord} disabled={currentWordIndex === words.length - 1 || buttonCooldown}>Sonraki →</button>
      </div>
    </div>
  );

  const MatchingGameView = () => (
    <div className="matching-game">
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
            <button className="btn-secondary" onClick={() => setCurrentView('practice')}>Çalışmaya Dön</button>
          </div>
        </div>
      )}
    </div>
  );

  const TestSetupView = () => (
    <div className="test-setup">
      <h2>🎯 Test Modu</h2>
      <p className="description">Kaç kelime ile test etmek istersin?</p>
      {error && <div className="error">{error}</div>}
      <div className="test-input">
        <input 
          id="test-count-input"
          type="number"
          defaultValue={10}
          min={5}
          max={words.length}
          style={{width: '100px', textAlign: 'center', padding: '15px', fontSize: '1.2rem'}}
        />
        <span>kelime (5-{words.length})</span>
      </div>
      <button className="start-test-btn" onClick={() => startTest()}>Testi Başlat</button>
      <div className="test-info">
        <p>• Her soru için 4 şık gösterilecek</p>
        <p>• Doğru anlamı seçmen gerekiyor</p>
        <p>• Sonuçları ve yanlışları görebileceksin</p>
      </div>
    </div>
  );

  const TestView = () => {
    const currentWord = testWords[testIndex];
    const progress = ((testIndex + 1) / testWords.length) * 100;
    
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
          <h3>"{currentWord.term}"</h3>
          <p>kelimesinin anlamı nedir?</p>
        </div>
        
        <div className="test-options">
          {testOptions.map((option, idx) => (
            <button
              key={idx}
              className={`option-btn ${showResult ? 
                (option.term === currentWord.term ? 'correct' : 
                 selectedOption?.term === option.term ? 'wrong' : '') : ''}`}
              onClick={() => handleTestAnswer(option)}
              disabled={showResult}
            >
              {option.meaning}
            </button>
          ))}
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
        <h1>YDT Kelime Pratiği</h1>

        
        <Navigation />

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

    </header>

    <main>
      {!testMode && currentView === 'practice' && <PracticeView />}
      {!testMode && currentView === 'test-setup' && <TestSetupView />}
      {testMode && !testFinished && <TestView />}
      {testMode && testFinished && <TestResultsView />}
      {currentView === 'favorites' && <FavoritesView />}
      {currentView === 'matching-game' && <MatchingGameView />}
      {currentView === 'word-list' && (
  <WordListView
    words={words}
    searchTerm={searchTerm}
    setSearchTerm={setSearchTerm}
    filteredWords={filteredWords}
    favorites={favorites}
    toggleFavorite={toggleFavorite}
  />
)}
      {currentView === 'wrong-words' && <WrongWordsView />}
      {currentView === 'room-menu' && <RoomMenuView />}
      {currentView === 'room' && <RoomView />}
    </main>

  </div>
);
}
function WordListView({ words, searchTerm, setSearchTerm, filteredWords, favorites, toggleFavorite }) {
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
      </div>

      <div className="word-grid">
        {filteredWords.map((word, idx) => (
          <div key={idx} className="word-card">

            <button
              className="fav-btn"
              onClick={() => toggleFavorite(word)}
            >
              {favorites.find(w => w.term === word.term) ? "⭐" : "☆"}
            </button>

            <h4>{word.term}</h4>
            <p className="meaning">{word.meaning}</p>
            <p className="hint">{word.hint}</p>

          </div>
        ))}
      </div>
    </div>
  );
}

export default App;