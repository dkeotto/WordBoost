import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { openConsentDialog } from '../utils/consentStorage';
import './Navbar.css';

const MOBILE_MQ = '(max-width: 1320px)';

const Navbar = ({
  currentView,
  setCurrentView,
  user,
  onLogoutClick,
  onLoginClick,
  onOpenSiteInfo = () => { },
  siteInfoTab = "features",
  isInRoom,
  wordsCount,
  wrongWordsCount,
  favoritesCount
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isListsOpen, setIsListsOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
  );
  const moreDropdownRef = useRef(null);
  const listsDropdownRef = useRef(null);
  const scrollLockYRef = useRef(0);

  const isPremium = useMemo(() => {
    if (!user) return false;
    if (user.isPremium) return true;
    if (user.premiumUntil) {
      const t = new Date(user.premiumUntil).getTime();
      return !Number.isNaN(t) && t > Date.now();
    }
    return false;
  }, [user]);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const mq = window.matchMedia(MOBILE_MQ);

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
        setIsMoreOpen(false);
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
    setIsMoreOpen(false);
  };

  const handleNavClick = (view) => {
    setCurrentView(view);
    setIsMenuOpen(false); // Menüyü kapat
    setIsListsOpen(false);
    setIsMoreOpen(false);
  };

  useEffect(() => {
    if (!isMoreOpen && !isListsOpen) return undefined;
    const onDoc = (e) => {
      const t = e.target;
      const inMore = moreDropdownRef.current?.contains(t);
      const inLists = listsDropdownRef.current?.contains(t);
      if (isMoreOpen && !inMore) setIsMoreOpen(false);
      if (isListsOpen && !inLists) setIsListsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isMoreOpen, isListsOpen]);

  const moreActive = [
    'matching-game',
    'leaderboard',
    'pricing',
    'synonyms',
    'phrasal-verbs',
    'speaking',
    'classroom',
    'room-menu',
    'room',
    'site-info',
    'terms',
    'privacy',
  ].includes(currentView);

  const handleSiteInfo = (tab) => {
    if (typeof onOpenSiteInfo === "function") onOpenSiteInfo(tab);
    setIsMenuOpen(false);
    setIsListsOpen(false);
    setIsMoreOpen(false);
  };

  const navMenuLinks = (
    <>
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
          className={`nav-link ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => handleNavClick('dashboard')}
        >
          📊 Dashboard
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${currentView === 'ai-writing' ? 'active' : ''}`}
          onClick={() => handleNavClick('ai-writing')}
        >
          ✍️ AI Yazım
        </button>
      </li>
      <li className="nav-item">
        <button
          className={`nav-link ${currentView === 'ai-chat' ? 'active' : ''}`}
          onClick={() => handleNavClick('ai-chat')}
        >
          💬 AI Sohbet
        </button>
      </li>

      <li ref={moreDropdownRef} className={`nav-item dropdown nav-more ${isMoreOpen ? 'open' : ''}`}>
        <button
          type="button"
          className={`dropdown-title ${moreActive ? 'active-route' : ''}`}
          aria-expanded={isMoreOpen}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsListsOpen(false);
            setIsMoreOpen((v) => !v);
          }}
        >
          <span className="title-content">
            <span style={{ marginRight: '5px' }}>⋯</span>
            Daha fazla
          </span>
        </button>
        <div className={`dropdown-content ${isMoreOpen ? 'show' : ''}`}>
          <button
            className={`nav-link ${currentView === 'matching-game' ? 'active' : ''}`}
            onClick={() => handleNavClick('matching-game')}
          >
            🎮 Eşleştirme
          </button>
          <button
            className={`nav-link ${currentView === 'draw-reveal' ? 'active' : ''}`}
            onClick={() => handleNavClick('draw-reveal')}
          >
            🎨 Resim Bulmaca
          </button>
          <button
            className={`nav-link ${currentView === 'leaderboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('leaderboard')}
          >
            🏆 Liderlik
          </button>
          <button
            type="button"
            className={`nav-link ${currentView === 'pricing' ? 'active' : ''}`}
            onClick={() => handleNavClick('pricing')}
          >
            💳 Fiyatlar
          </button>
          <button
            className={`nav-link ${currentView === 'synonyms' ? 'active' : ''}`}
            onClick={() => handleNavClick('synonyms')}
          >
            🔁 Synonyms
          </button>
          <button
            className={`nav-link ${currentView === 'phrasal-verbs' ? 'active' : ''}`}
            onClick={() => handleNavClick('phrasal-verbs')}
          >
            🧩 Phrasal
          </button>
          <button
            className={`nav-link ${currentView === 'speaking' ? 'active' : ''}`}
            onClick={() => handleNavClick('speaking')}
          >
            🎙️ Speaking
          </button>
          <button
            className={`nav-link ${currentView === 'classroom' ? 'active' : ''}`}
            onClick={() => handleNavClick('classroom')}
          >
            🏫 Classroom
          </button>
          <button
            className={`nav-link ${currentView === 'room-menu' || (currentView === 'room' && isInRoom) ? 'active' : ''}`}
            onClick={() => handleNavClick(isInRoom ? 'room' : 'room-menu')}
          >
            👥 Oda {isInRoom ? '(Aktif)' : ''}
          </button>

          {(user?.isAdmin || user?.username?.toLowerCase() === 'doruk' || user?.username?.toLowerCase() === 'dkeotto') && (
            <button
              className={`nav-link ${currentView === 'admin' ? 'active' : ''}`}
              onClick={() => handleNavClick('admin')}
              style={{ color: '#FF5722', fontWeight: 'bold' }}
            >
              🛡️ Admin Paneli
            </button>
          )}

          <div className="nav-dropdown-divider" role="separator" aria-hidden />

          <button
            type="button"
            className={`nav-link ${currentView === "site-info" && siteInfoTab === "features" ? "active" : ""}`}
            onClick={() => handleSiteInfo("features")}
          >
            ✨ Özellikler
          </button>
          <button
            type="button"
            className={`nav-link ${currentView === "site-info" && siteInfoTab === "about" ? "active" : ""}`}
            onClick={() => handleSiteInfo("about")}
          >
            ℹ️ Hakkında
          </button>
          <button
            type="button"
            className={`nav-link ${currentView === "privacy" || (currentView === "site-info" && siteInfoTab === "privacy") ? "active" : ""
              }`}
            onClick={() => handleSiteInfo("privacy")}
          >
            🔒 Gizlilik
          </button>
          <button
            type="button"
            className={`nav-link ${currentView === "terms" || (currentView === "site-info" && siteInfoTab === "terms") ? "active" : ""
              }`}
            onClick={() => handleSiteInfo("terms")}
          >
            📜 Şartlar
          </button>
        </div>
      </li>

      <li ref={listsDropdownRef} className={`nav-item dropdown nav-lists ${isListsOpen ? 'open' : ''}`}>
        <button
          type="button"
          className="dropdown-title"
          aria-expanded={isListsOpen}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsMoreOpen(false);
            setIsListsOpen((v) => !v);
          }}
        >
          <div className="title-content">
            <span style={{ marginRight: '5px' }}>📚</span>
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
            <div className="user-controls-meta" aria-label="Hesap durumu ve çerezler">
              <span
                className={`nav-premium-badge ${isPremium ? 'nav-premium-badge--pro' : 'nav-premium-badge--free'}`}
                title={isPremium ? 'Premium üyelik aktif' : 'Ücretsiz hesap'}
              >
                {isPremium ? 'PRO' : 'Ücretsiz'}
              </span>
              <button
                type="button"
                className="nav-cookie-mini"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openConsentDialog();
                }}
                title="Çerez ve reklam tercihleri"
                aria-label="Çerez ve reklam tercihleri"
              >
                🍪
              </button>
            </div>
            <div className="user-controls-actions">
              <button className="nav-link profile-btn" onClick={() => handleNavClick('profile')}>
                {user.avatar && typeof user.avatar === 'string' && (user.avatar.startsWith('http') || user.avatar.startsWith('data:')) ? (
                  <img src={user.avatar} className="nav-avatar-img" alt="avatar" />
                ) : (
                  typeof user.avatar === 'string' ? user.avatar : '👤'
                )}
                <span className="nav-profile-name">{user.nickname || user.username}</span>
              </button>
              <button className="logout-icon-btn" onClick={() => { onLogoutClick(); setIsMenuOpen(false); }} title="Çıkış Yap">
                🚪
              </button>
            </div>
          </div>
        ) : (
          <div className="user-controls user-controls--guest">
            <button
              type="button"
              className="nav-cookie-mini"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openConsentDialog();
                setIsMenuOpen(false);
              }}
              title="Çerez ve reklam tercihleri"
            >
              🍪
            </button>
            <button
              type="button"
              className="nav-link login-btn"
              onClick={() => {
                onLoginClick();
                setIsMenuOpen(false);
              }}
            >
              🔐 Giriş Yap
            </button>
          </div>
        )}
      </li>
    </>
  );

  const mobileMenuPortal =
    isMobileLayout &&
    typeof document !== 'undefined' &&
    createPortal(
      <div className={`nav-menu-drawer ${isMenuOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Menü">
        <button
          type="button"
          className="nav-menu-drawer-scrim"
          aria-hidden={!isMenuOpen}
          aria-label="Menüyü kapat"
          tabIndex={isMenuOpen ? 0 : -1}
          onClick={closeMenuOverlay}
        />
        <div className="nav-menu-drawer-panel">
          <div className="nav-menu-drawer-header">
            <span className="nav-menu-drawer-title">Menü</span>
            <button type="button" className="nav-menu-close-btn" onClick={closeMenuOverlay} aria-label="Kapat">
              ✕
            </button>
          </div>
          <ul className="nav-menu nav-menu--portal">{navMenuLinks}</ul>
        </div>
      </div>,
      document.body
    );

  return (
    <>
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

          {!isMobileLayout && (
            <>
              {isMenuOpen && (
                <button
                  type="button"
                  className="nav-menu-backdrop"
                  aria-label="Menüyü kapat"
                  onClick={closeMenuOverlay}
                />
              )}
              <ul className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>{navMenuLinks}</ul>
            </>
          )}
        </div>
      </nav>
      {mobileMenuPortal}
    </>
  );
};

export default Navbar;
