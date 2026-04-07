import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { apiUrl } from '../utils/apiUrl';

const FAMOUS_PAINTINGS = [
  { id: 1, title: "Mona Lisa", artist: "Leonardo da Vinci", url: "https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg" },
  { id: 2, title: "The Starry Night", artist: "Vincent van Gogh", url: "https://upload.wikimedia.org/wikipedia/commons/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg" },
  { id: 3, title: "Girl with a Pearl Earring", artist: "Johannes Vermeer", url: "https://upload.wikimedia.org/wikipedia/commons/0/0f/1665_Girl_with_a_Pearl_Earring.jpg" },
  { id: 4, title: "The Scream", artist: "Edvard Munch", url: "https://upload.wikimedia.org/wikipedia/commons/f/f4/The_Scream.jpg" },
  { id: 5, title: "The Birth of Venus", artist: "Sandro Botticelli", url: "https://upload.wikimedia.org/wikipedia/commons/0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project.jpg" },
  { id: 6, title: "The Night Watch", artist: "Rembrandt van Rijn", url: "https://upload.wikimedia.org/wikipedia/commons/5/5a/The_Night_Watch_-_HD.jpg" },
  { id: 7, title: "The Kiss", artist: "Gustav Klimt", url: "https://upload.wikimedia.org/wikipedia/commons/4/40/The_Kiss_-_Gustav_Klimt_-_Google_Art_Project.jpg" },
  { id: 8, title: "American Gothic", artist: "Grant Wood", url: "https://upload.wikimedia.org/wikipedia/commons/c/cc/Grant_Wood_-_American_Gothic_-_Google_Art_Project.jpg" },
  { id: 9, title: "The Last Supper", artist: "Leonardo da Vinci", url: "https://upload.wikimedia.org/wikipedia/commons/4/4b/Ultima_Cena_-_Restored_-_Lightened.jpg" },
  { id: 10, title: "Great Wave off Kanagawa", artist: "Hokusai", url: "https://upload.wikimedia.org/wikipedia/commons/0/0a/The_Great_Wave_off_Kanagawa.jpg" }
];

const DrawRevealGame = ({ words, user, onUpdateStats, speakWord, favorites = [], toggleFavorite, playSound }) => {
  const [currentPainting, setCurrentPainting] = useState(null);
  const [revealedTiles, setRevealedTiles] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [gameState, setGameState] = useState('loading'); // loading, playing, finished
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState(0);

  const gridSize = 3; // 3x3 = 9 questions
  const totalTiles = gridSize * gridSize;

  const startNewGame = useCallback(() => {
    const randomPainting = FAMOUS_PAINTINGS[Math.floor(Math.random() * FAMOUS_PAINTINGS.length)];
    setCurrentPainting(randomPainting);
    setRevealedTiles([]);
    setScore(0);
    setGameState('playing');
    generateNextQuestion();
  }, [words]);

  const generateNextQuestion = useCallback(() => {
    if (words.length < 4) return;
    
    const randomIndex = Math.floor(Math.random() * words.length);
    const correctWord = words[randomIndex];
    
    // Generate options
    let otherOptions = [];
    const pool = [...words];
    pool.splice(randomIndex, 1);
    
    while (otherOptions.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      otherOptions.push(pool.splice(idx, 1)[0]);
    }
    
    const allOptions = [correctWord, ...otherOptions].sort(() => Math.random() - 0.5);
    
    setCurrentQuestion(correctWord);
    setOptions(allOptions);
  }, [words]);

  useEffect(() => {
    if (words.length > 0 && gameState === 'loading') {
      startNewGame();
    }
  }, [words, gameState, startNewGame]);

  const handleAnswer = (selectedWord) => {
    if (gameState !== 'playing' || feedback) return;

    const isCorrect = selectedWord.term === currentQuestion.term;
    
    if (isCorrect) {
      if (playSound) playSound('correct');
      setFeedback({ type: 'correct', message: 'Doğru!' });
      setScore(prev => prev + 10);
      
      const newRevealed = [...revealedTiles, revealedTiles.length];
      setRevealedTiles(newRevealed);
      
      if (newRevealed.length === totalTiles) {
        setTimeout(() => {
          setGameState('finished');
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FF9F1C', '#FFB300', '#FFFFFF']
          });
          awardPainterBadge();
        }, 1000);
      }
    } else {
      if (playSound) playSound('wrong');
      setFeedback({ type: 'wrong', message: `Yanlış! Doğru cevap: ${currentQuestion.meaning}` });
    }

    // Update global stats
    if (onUpdateStats) {
      onUpdateStats(isCorrect, currentQuestion.term);
    }

    setTimeout(() => {
      setFeedback(null);
      if (revealedTiles.length + (isCorrect ? 1 : 0) < totalTiles) {
        generateNextQuestion();
      }
    }, 1500);
  };

  const awardPainterBadge = async () => {
    if (!user || !user.token) return;
    try {
      await fetch(apiUrl('/api/profile/badge'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': user.token
        },
        body: JSON.stringify({ badgeId: 'painter' })
      });
    } catch (err) {
      console.error('Badge award error:', err);
    }
  };

  if (gameState === 'loading') return <div className="loading">Yükleniyor...</div>;

  return (
    <div className="draw-reveal-game">
      <div className="game-header">
        <h2>🎨 Tabloyu Keşfet</h2>
        <div className="game-stats">
          <span className="game-score">Puan: {score}</span>
          <span className="game-progress">İlerleme: {revealedTiles.length}/{totalTiles}</span>
        </div>
      </div>

      <div className="game-container">
        <div className="painting-canvas" style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}>
          {currentPainting && (
            <img 
              src={currentPainting.url} 
              alt="Discovering..." 
              className="painting-image"
              style={{ filter: revealedTiles.length === totalTiles ? 'none' : 'blur(5px)' }}
            />
          )}
          {Array.from({ length: totalTiles }).map((_, idx) => (
            <div 
              key={idx} 
              className={`painting-tile ${revealedTiles.includes(idx) ? 'revealed' : ''}`}
            >
              {!revealedTiles.includes(idx) && <div className="tile-placeholder">?</div>}
            </div>
          ))}
        </div>

        {gameState === 'playing' && currentQuestion && (
          <div className="question-area">
            <div className="question-card">
               <div className="question-term-row">
                 <div className="action-buttons">
                    <button 
                      className="game-action-btn speak" 
                      onClick={() => speakWord(currentQuestion)}
                      title="Telaffuz"
                    >
                      🔊
                    </button>
                    <button 
                      className="game-action-btn favorite" 
                      onClick={() => toggleFavorite(currentQuestion)}
                      title="Favorilere Ekle"
                    >
                      {favorites.find(w => w.term === currentQuestion.term) ? "⭐" : "☆"}
                    </button>
                 </div>
                 <span className="question-level">{currentQuestion.level}</span>
               </div>
               <h3>{currentQuestion.term}</h3>
               <p className="question-hint">Anlamı nedir?</p>
            </div>

            <div className="options-grid">
              {options.map((opt, idx) => (
                <button 
                  key={idx} 
                  className={`option-btn ${feedback && opt.term === currentQuestion.term ? 'correct' : ''}`}
                  onClick={() => handleAnswer(opt)}
                  disabled={!!feedback}
                >
                  {opt.meaning}
                </button>
              ))}
            </div>
          </div>
        )}

        {gameState === 'finished' && (
          <div className="game-finished-overlay">
            <div className="finished-card">
              <h3>Tebrikler!</h3>
              <p>"{currentPainting.title}" ( {currentPainting.artist} ) tablosunu başarıyla açtın!</p>
              <div className="finished-buttons">
                <button className="btn-primary" onClick={startNewGame}>Yeni Tablo</button>
              </div>
            </div>
          </div>
        )}

        {feedback && (
          <div className={`game-feedback ${feedback.type}`}>
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default DrawRevealGame;
