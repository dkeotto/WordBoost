import { useState } from "react";
import { getBackendOrigin, getGoogleAuthUrl } from "../utils/backendOrigin";

export default function LoginModal({ onLogin, onClose }) {
  const [activeTab, setActiveTab] = useState("login"); // 'login', 'register', 'verify', 'forgot', 'reset'
  
  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Register Form
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // Verification & Reset Form
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyEmail, setVerifyEmail] = useState(""); // Used for both register-verify and forgot-password
  const [newPassword, setNewPassword] = useState("");

  // Global submit/loading state to prevent double clicks
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState("");
  /** Sunucunun 503 detail alanı (Brevo/SMTP hata metni) */
  const [registerErrorDetail, setRegisterErrorDetail] = useState("");

  const handleLogin = async () => {
    if (isSubmitting) return;
    if (!loginIdentifier || !loginPassword) {
      alert("Lütfen tüm alanları doldurun.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginIdentifier, password: loginPassword })
      });

      const data = await res.json();

      if (data.success && data.token) {
        if (rememberMe) {
          localStorage.setItem("remember_me", "true");
        }
        onLogin({ ...data.user, token: data.token });
        return;
      }

      // Hesap var ama e-posta henüz doğrulanmamış
      if (data.requireVerification && data.email) {
        setVerifyEmail(data.email);
        setActiveTab("verify");
        alert(
          "Bu hesap için önce e-posta doğrulaması gerekli. Gelen kutunu kontrol et veya aşağıya kodu gir."
        );
        return;
      }

      alert("Giriş başarısız. Bilgileri kontrol edin.");
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async () => {
    if (isSubmitting) return;
    if (!regEmail || !regUsername || !regPassword) {
      alert("Lütfen tüm alanları doldurun.");
      return;
    }

    setRegisterError("");
    setRegisterErrorDetail("");
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, email: regEmail, password: regPassword })
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      // Backend metnindeki encoding sorunlarını kullanıcıya yansıtma.
      if (!res.ok) {
        if (res.status === 503 || res.status >= 500) {
          setRegisterError("mail_failed");
          const d = typeof data.detail === "string" ? data.detail : "";
          setRegisterErrorDetail(d.length > 400 ? d.slice(0, 400) + "…" : d);
        } else {
          alert("Kayıt başarısız. Bilgileri kontrol edip tekrar deneyin.");
        }
        return;
      }

      if (data.success && data.requireVerification) {
        setVerifyEmail(
          typeof data.email === "string" && data.email
            ? data.email
            : String(regEmail || "").trim().toLowerCase()
        );
        setActiveTab("verify");
        setRegisterError("");
        setRegisterErrorDetail("");
        alert("Doğrulama kodu e-posta adresinize gönderildi. Gelen kutusu ve spam klasörünü kontrol et.");
        return;
      }

      alert("Kayıt tamamlanamadı. Lütfen tekrar deneyin.");
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (isSubmitting) return;
    if (!verifyCode) {
      alert("Lütfen kodu girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const emailNorm = String(verifyEmail || "")
        .trim()
        .toLowerCase();
      const codeNorm = String(verifyCode || "").replace(/\s/g, "");
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailNorm, code: codeNorm })
      });

      const data = await res.json();

      if (data.success) {
        alert("Hesabınız doğrulandı! Giriş yapılıyor...");
        onLogin({ ...data.user, token: data.token });
      } else {
        alert(data.error || "Doğrulama başarısız");
      }
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (isSubmitting) return;
    if (!verifyEmail) {
      alert("Lütfen email adresinizi girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail })
      });

      const data = await res.json();

      if (data.success) {
        alert("Sıfırlama kodu gönderildi.");
        setActiveTab("reset");
      } else {
        alert(data.error || "İşlem başarısız");
      }
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (isSubmitting) return;
    if (!verifyCode || !newPassword) {
      alert("Lütfen kod ve yeni şifreyi girin.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, code: verifyCode, newPassword })
      });

      const data = await res.json();

      if (data.success) {
        alert("Şifreniz başarıyla güncellendi. Giriş yapabilirsiniz.");
        setActiveTab("login");
      } else {
        alert(data.error || "Sıfırlama başarısız");
      }
    } catch {
      alert("Bağlantı hatası");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-modal extended">
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <div className="login-modal-header">
          <img src="/favicon.png" alt="" className="login-modal-logo" aria-hidden="true" />
          <h2>WordBoost</h2>
        </div>
        
        {['login', 'register'].includes(activeTab) && (
          <div className="login-tabs">
            <button 
              className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => { setRegisterError(""); setRegisterErrorDetail(""); setActiveTab('login'); }}
            >
              Giriş Yap
            </button>
            <button 
              className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => { setRegisterError(""); setRegisterErrorDetail(""); setActiveTab('register'); }}
            >
              Kayıt Ol
            </button>
          </div>
        )}

        <div className="tab-content">
          {activeTab === 'login' ? (
            <div className="form-group">
              <input
                placeholder="Kullanıcı Adı veya Email"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                style={{ letterSpacing: 'normal' }}
              />
              <input
                type="password"
                placeholder="Şifre"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                style={{ letterSpacing: 'normal' }}
              />
              
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div className="remember-me">
                  <input 
                    type="checkbox" 
                    id="remember" 
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <label htmlFor="remember">Beni Hatırla</label>
                </div>
                <button 
                  className="btn-link" 
                  onClick={() => { setVerifyEmail(''); setActiveTab('forgot'); }}
                  style={{background: 'none', border: 'none', color: '#ff9f1c', fontSize: '0.9rem', cursor: 'pointer', padding: 0}}
                >
                  Şifremi Unuttum
                </button>
              </div>

              <button
                className="primary-btn"
                onClick={handleLogin}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
              </button>
            </div>
          ) : activeTab === 'register' ? (
            <div className="form-group">
              {registerError === "mail_failed" && (
                <div className="login-inline-error" role="alert">
                  <strong>Doğrulama e-postası gönderilemedi</strong>
                  Birkaç dakika sonra tekrar dene. Sorun sürerse e-posta ayarları (sunucu) kontrol edilmeli.
                  {registerErrorDetail ? (
                    <pre
                      className="hint"
                      style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "0.8rem",
                        marginTop: 10,
                        padding: 10,
                        background: "rgba(0,0,0,0.35)",
                        borderRadius: 8,
                        color: "#ffd4d4"
                      }}
                    >
                      {registerErrorDetail}
                    </pre>
                  ) : null}
                  <p className="hint">
                    Gmail SMTP bulut sunucudan sık reddedilir. Domain yokken: Brevo’da{" "}
                    <code style={{ fontSize: "0.78em", opacity: 0.9 }}>BREVO_API_KEY</code> + gönderici
                    e-postayı doğrula ({" "}
                    <code style={{ fontSize: "0.78em", opacity: 0.9 }}>BREVO_FROM_EMAIL</code> ),{" "}
                    <code style={{ fontSize: "0.78em", opacity: 0.9 }}>MAIL_FORCE_SMTP</code>’yi kapat.
                    Domain varsa Resend de kullanılabilir.
                  </p>
                </div>
              )}
              <input
                type="email"
                placeholder="Email Adresi"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                style={{ letterSpacing: 'normal' }}
              />
              <input
                placeholder="Kullanıcı Adı"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
                style={{ letterSpacing: 'normal' }}
              />
              <input
                type="password"
                placeholder="Şifre"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                style={{ letterSpacing: 'normal' }}
              />
              <button
                className="primary-btn"
                onClick={handleRegister}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Kayıt olunuyor..." : "Kayıt Ol"}
              </button>
            </div>
          ) : activeTab === 'verify' ? (
            <div className="form-group">
              <p style={{textAlign: 'center', marginBottom: '10px', color: '#ccc'}}>
                {verifyEmail} adresine gönderilen 6 haneli kodu girin:
              </p>
              <input
                type="text"
                placeholder="Doğrulama Kodu"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                maxLength={6}
                style={{textAlign: 'center', fontSize: '1.2rem', letterSpacing: '5px'}}
              />
              <button
                className="primary-btn"
                onClick={handleVerify}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Doğrulanıyor..." : "Doğrula ve Giriş Yap"}
              </button>
              <button 
                className="btn-guest" 
                onClick={() => setActiveTab('register')}
                style={{marginTop: '10px', fontSize: '0.9rem'}}
              >
                ← Geri Dön
              </button>
            </div>
          ) : activeTab === 'forgot' ? (
            <div className="form-group">
              <h3>Şifre Sıfırlama</h3>
              <p style={{textAlign: 'center', color: '#ccc', fontSize: '0.9rem'}}>Hesabınıza kayıtlı email adresini girin.</p>
              <input
                type="email"
                placeholder="Email Adresi"
                value={verifyEmail}
                onChange={(e) => setVerifyEmail(e.target.value)}
                style={{ letterSpacing: 'normal' }}
              />
              <button
                className="primary-btn"
                onClick={handleForgotPassword}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Gönderiliyor..." : "Kod Gönder"}
              </button>
              <button 
                className="btn-guest" 
                onClick={() => setActiveTab('login')}
                style={{marginTop: '10px', fontSize: '0.9rem'}}
              >
                ← İptal
              </button>
            </div>
          ) : activeTab === 'reset' ? (
            <div className="form-group">
              <h3>Yeni Şifre Belirle</h3>
              <input
                type="text"
                placeholder="Gelen Kod (6 haneli)"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                maxLength={6}
                style={{textAlign: 'center', letterSpacing: '5px'}}
              />
              <input
                type="password"
                placeholder="Yeni Şifre"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ letterSpacing: 'normal' }}
              />
              <button
                className="primary-btn"
                onClick={handleResetPassword}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
              </button>
            </div>
          ) : null}
        </div>

        {['login', 'register'].includes(activeTab) && (
          <>
            <div className="social-login-separator">
              <span>veya</span>
            </div>

            <div className="social-actions">
              <button
                className="btn-google"
                type="button"
                onClick={() => {
                  if (import.meta.env.PROD && !getBackendOrigin()) {
                    alert(
                      "Google girişi için VITE_BACKEND_URL veya VITE_SOCKET_URL (Railway kök URL) Vercel ortam değişkenlerinde tanımlı olmalı."
                    );
                    return;
                  }
                  window.location.href = getGoogleAuthUrl();
                }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.464 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.464 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
                Google ile Devam Et
              </button>

              <button
                className="btn-guest"
                onClick={() => onLogin({ username: "Misafir" })}
              >
                Misafir Olarak Devam Et
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}