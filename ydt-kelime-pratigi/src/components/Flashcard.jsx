import React, { memo } from 'react';

const Flashcard = memo(({ 
  word, 
  isFlipped, 
  flipCard, 
  showHint, 
  setShowHint, 
  showExample, 
  setShowExample, 
  feedback, 
  feedbackMessage, 
  favorites, 
  toggleFavorite, 
  speakWord 
}) => (
    <div className="flashcard-container">
      <div className="flashcard" onClick={flipCard}>
        <div className={`card-inner ${isFlipped ? 'flipped' : ''}`}>
          <div className="card-front">
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
              {(favorites || []).find(w => w.term === word.term) ? "⭐" : "☆"}
            </button>

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
));

export default Flashcard;
