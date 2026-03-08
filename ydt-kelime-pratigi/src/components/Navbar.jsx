import React, { useState } from 'react';
import './Navbar.css';

const Navbar = ({ 
  currentView, 
  setCurrentView, 
  user, 
  onLogoutClick, 
  onLoginClick,
  isInRoom,
  wordsCount,
  wrongWordsCount,
  favoritesCount,
  setTestMode,
  setMatchingGame
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleNavClick = (view, action = null) => {
    setCurrentView(view);
    if (action) action();
    setIsMenuOpen(false); // Menüyü kapat
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-logo" onClick={() => handleNavClick('practice', () => { setTestMode(false); setMatchingGame(false); })}>
          <img src="/wb-logo.png" alt="WB" className="navbar-logo-img" onError={(e) => e.target.style.display = 'none'} />
          <h1>WordBoost</h1>
        </div>

        <div className={`menu-icon ${isMenuOpen ? 'open' : ''}`} onClick={toggleMenu}>
          <div className="bar1"></div>
          <div className="bar2"></div>
          <div className="bar3"></div>
        </div>

        <ul className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'practice' ? 'active' : ''}`}
              onClick={() => handleNavClick('practice', () => { setTestMode(false); setMatchingGame(false); })}
            >
              📝 Çalışma
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'test-setup' ? 'active' : ''}`}
              onClick={() => handleNavClick('test-setup', () => { setTestMode(false); setMatchingGame(false); })}
            >
              🎯 Test
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'matching-game' ? 'active' : ''}`}
              onClick={() => handleNavClick('matching-game', () => { setMatchingGame(false); })}
            >
              🎮 Eşleştirme
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'room-menu' || isInRoom ? 'active' : ''}`}
              onClick={() => handleNavClick(isInRoom ? 'room' : 'room-menu')}
            >
              👥 Oda {isInRoom && '(Aktif)'}
            </button>
          </li>
          
          <li className="nav-item dropdown">
             <span className="dropdown-title">📚 Listeler ▼</span>
             <div className="dropdown-content">
                <button 
                  className={`nav-link ${currentView === 'word-list' ? 'active' : ''}`}
                  onClick={() => handleNavClick('word-list')}
                >
                  Tüm Kelimeler ({wordsCount})
                </button>
                <button 
                  className={`nav-link ${currentView === 'wrong-words' ? 'active' : ''}`}
                  onClick={() => handleNavClick('wrong-words')}
                >
                  Yanlışlar ({wrongWordsCount})
                </button>
                <button
                  className={`nav-link ${currentView === 'favorites' ? 'active' : ''}`}
                  onClick={() => handleNavClick('favorites')}
                >
                  Favoriler ({favoritesCount})
                </button>
             </div>
          </li>

          <li className="nav-item user-section">
            {user ? (
              <button className="nav-link profile-btn" onClick={() => { onLogoutClick(); setIsMenuOpen(false); }}>
                👤 {user.username} (Çıkış)
              </button>
            ) : (
              <button className="nav-link login-btn" onClick={() => { onLoginClick(); setIsMenuOpen(false); }}>
                🔐 Giriş Yap
              </button>
            )}
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default Navbar;
