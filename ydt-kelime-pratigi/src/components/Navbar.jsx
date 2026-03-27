import React, { useState, useRef, useEffect } from 'react';
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
  const listsDropdownRef = useRef(null);
  const scrollLockYRef = useRef(0);

  useEffect(() => {
    if (!isListsOpen || !listsDropdownRef.current) return;
    listsDropdownRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isListsOpen]);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const mq = window.matchMedia('(max-width: 1320px)');

    const clearScrollLock = () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      window.scrollTo(0, scrollLockYRef.current);
    };

    const applyScrollLock = () => {
      scrollLockYRef.current = window.scrollY;
      const y = scrollLockYRef.current;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${y}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    };

    const onViewportChange = () => {
      if (!mq.matches) {
        setIsMenuOpen(false);
        setIsListsOpen(false);
      }
    };

    if (!mq.matches) return undefined;

    applyScrollLock();
    mq.addEventListener('change', onViewportChange);

    return () => {
      mq.removeEventListener('change', onViewportChange);
      clearScrollLock();
    };
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const closeMenuOverlay = () => {
    setIsMenuOpen(false);
    setIsListsOpen(false);
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
          {logoFailed ? (
            <h1 className="navbar-logo-fallback">WordBoost</h1>
          ) : (
            <img
              src="/wb-logo.png"
              alt="WordBoost"
              className="navbar-logo-img"
              onError={() => setLogoFailed(true)}
            />
          )}
          {!logoFailed && <span className="navbar-wordmark">WordBoost</span>}
        </div>

        <div className={`menu-icon ${isMenuOpen ? 'open' : ''}`} onClick={toggleMenu}>
          <div className="bar1"></div>
          <div className="bar2"></div>
          <div className="bar3"></div>
        </div>

        {isMenuOpen && (
          <button
            type="button"
            className="nav-menu-backdrop"
            aria-label="Menüyü kapat"
            onClick={closeMenuOverlay}
          />
        )}

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
          
          <li ref={listsDropdownRef} className={`nav-item dropdown ${isListsOpen ? 'open' : ''}`}>
             <button
               type="button"
               className="dropdown-title"
               aria-expanded={isListsOpen}
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
