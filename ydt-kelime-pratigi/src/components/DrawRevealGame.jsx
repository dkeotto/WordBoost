import React, { useState, useEffect, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { apiUrl } from '../utils/apiUrl';

const FAMOUS_PAINTINGS = [
  {
    id: 1,
    title: "Mona Lisa",
    artist: "Leonardo da Vinci",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/687px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg"
  },
  {
    id: 2,
    title: "The Starry Night",
    artist: "Vincent van Gogh",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/1280px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg"
  },
  {
    id: 3,
    title: "Girl with a Pearl Earring",
    artist: "Johannes Vermeer",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/1665_Girl_with_a_Pearl_Earring.jpg/800px-1665_Girl_with_a_Pearl_Earring.jpg"
  },
  {
    id: 4,
    title: "The Persistence of Memory",
    artist: "Salvador Dalí",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/The_Persistence_of_Memory_by_Salvador_Dali.jpg/800px-The_Persistence_of_Memory_by_Salvador_Dali.jpg"
  },
  {
    id: 5,
    title: "The Birth of Venus",
    artist: "Sandro Botticelli",
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project.jpg/1280px-Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project.jpg"
  }
];

const DrawRevealGame = ({ words, user, onUpdateStats, speakWord }) => {
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
                 <button className="speak-btn" onClick={() => speakWord(currentQuestion)}>🔊</button>
                 <span className="question-level">{currentQuestion.level}</span>
               </div>
               <h3>{currentQuestion.term}</h3>
               <p>Anlamı nedir?</p>
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
