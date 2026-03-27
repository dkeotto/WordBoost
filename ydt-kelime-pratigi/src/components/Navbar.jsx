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
  favoritesCount
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isListsOpen, setIsListsOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleNavClick = (view) => {
    setCurrentView(view);
    setIsMenuOpen(false); // Menüyü kapat
    setIsListsOpen(false);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-logo" onClick={() => handleNavClick('practice')}>
          <img
            src="/wordboost-logo.png"
            alt="WordBoost"
            className="navbar-logo-img"
            onError={() => setLogoFailed(true)}
          />
          {logoFailed && <h1>WordBoost</h1>}
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
              onClick={() => handleNavClick('practice')}
            >
              📝 Çalışma
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'test' ? 'active' : ''}`}
              onClick={() => handleNavClick('test')}
            >
              🎯 Test
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'matching-game' ? 'active' : ''}`}
              onClick={() => handleNavClick('matching-game')}
            >
              🎮 Eşleştirme
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${currentView === 'leaderboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('leaderboard')}
            >
              🏆 Liderlik
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleNavClick('dashboard')}
            >
              📊 Dashboard
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${currentView === 'synonyms' ? 'active' : ''}`}
              onClick={() => handleNavClick('synonyms')}
            >
              🔁 Synonyms
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${currentView === 'phrasal-verbs' ? 'active' : ''}`}
              onClick={() => handleNavClick('phrasal-verbs')}
            >
              🧩 Phrasal Verbs
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
          
          <li className={`nav-item dropdown ${isListsOpen ? 'open' : ''}`}>
             <button
               type="button"
               className="dropdown-title"
               onClick={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 setIsListsOpen((v) => !v);
               }}
             >
               <div className="title-content">
                 <span style={{marginRight: '5px'}}>📚</span>
                 Listeler
               </div>
             </button>
             <div className={`dropdown-content ${isListsOpen ? 'show' : ''}`}>
                <button 
                  className={`nav-link ${currentView === 'word-list' ? 'active' : ''}`}
                  onClick={() => handleNavClick('word-list')}
                >
                  Tüm Kelimeler ({wordsCount})
                </button>
                <button
                  className={`nav-link ${currentView === 'synonyms-list' ? 'active' : ''}`}
                  onClick={() => handleNavClick('synonyms-list')}
                >
                  Synonyms Listesi
                </button>
                <button
                  className={`nav-link ${currentView === 'phrasal-list' ? 'active' : ''}`}
                  onClick={() => handleNavClick('phrasal-list')}
                >
                  Phrasal Listesi
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
              <div className="user-controls">
                <button className="nav-link profile-btn" onClick={() => handleNavClick('profile')}>
                  {user.avatar && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                    <img src={user.avatar} className="nav-avatar-img" alt="avatar" />
                  ) : (
                    user.avatar || '👤'
                  )}
                  {user.nickname || user.username}
                </button>
                <button className="logout-icon-btn" onClick={() => { onLogoutClick(); setIsMenuOpen(false); }} title="Çıkış Yap">
                  🚪
                </button>
              </div>
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
