import { useState } from "react";

export default function LoginModal({ onLogin, onClose }) {
  const [activeTab, setActiveTab] = useState("login"); // 'login', 'register', 'verify'
  
  // Login Form
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Register Form
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");

  // Verification Form
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyEmail, setVerifyEmail] = useState("");

  const handleLogin = async () => {
    if (!loginIdentifier || !loginPassword) {
      alert("Lütfen tüm alanları doldurun.");
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginIdentifier, password: loginPassword })
      });

      const data = await res.json();

      if (data.success) {
        if (rememberMe) {
          localStorage.setItem("remember_me", "true");
        }
        onLogin({ ...data.user, token: data.token });
      } else {
        alert(data.error || "Giriş başarısız");
      }
    } catch (err) {
      alert("Bağlantı hatası");
    }
  };

  const handleRegister = async () => {
    if (!regEmail || !regUsername || !regPassword) {
      alert("Lütfen tüm alanları doldurun.");
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, email: regEmail, password: regPassword })
      });

      const data = await res.json();

      if (data.success) {
        if (data.requireVerification) {
          setVerifyEmail(regEmail); // Backend'den gelen maili de kullanabiliriz
          setActiveTab("verify");
          alert("Doğrulama kodu mail adresinize gönderildi.");
        } else {
          alert("Hesap başarıyla oluşturuldu! Şimdi giriş yapabilirsiniz.");
          setActiveTab("login");
          setLoginIdentifier(regUsername);
          setLoginPassword(regPassword);
        }
      } else {
        alert(data.error || "Kayıt başarısız");
      }
    } catch (err) {
      alert("Bağlantı hatası");
    }
  };

  const handleVerify = async () => {
    if (!verifyCode) {
      alert("Lütfen kodu girin.");
      return;
    }

    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: verifyEmail, code: verifyCode })
      });

      const data = await res.json();

      if (data.success) {
        alert("Hesabınız doğrulandı! Giriş yapılıyor...");
        onLogin({ ...data.user, token: data.token });
      } else {
        alert(data.error || "Doğrulama başarısız");
      }
    } catch (err) {
      alert("Bağlantı hatası");
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-modal extended">
        <button className="close-btn" onClick={onClose}>✕</button>
        
        <h2>🦊 WordBoost</h2>
        
        {activeTab !== 'verify' && (
          <div className="login-tabs">
            <button 
              className={`tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => setActiveTab('login')}
            >
              Giriş Yap
            </button>
            <button 
              className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
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
              />
              <input
                type="password"
                placeholder="Şifre"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
              
              <div className="remember-me">
                <input 
                  type="checkbox" 
                  id="remember" 
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <label htmlFor="remember">Beni Hatırla</label>
              </div>

              <button className="primary-btn" onClick={handleLogin}>Giriş Yap</button>
            </div>
          ) : activeTab === 'register' ? (
            <div className="form-group">
              <input
                type="email"
                placeholder="Email Adresi"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
              <input
                placeholder="Kullanıcı Adı"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
              <input
                type="password"
                placeholder="Şifre"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
              <button className="primary-btn" onClick={handleRegister}>Kayıt Ol</button>
            </div>
          ) : (
            <div className="form-group">
              <p style={{textAlign: 'center', marginBottom: '10px', color: '#ccc'}}>
                {verifyEmail} adresine gönderilen 6 haneli kodu girin:
              </p>
              <input
                type="text"
                placeholder="Doğrulama Kodu (Örn: 123456)"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                maxLength={6}
                style={{textAlign: 'center', letterSpacing: '5px', fontSize: '1.2rem'}}
              />
              <button className="primary-btn" onClick={handleVerify}>Doğrula ve Giriş Yap</button>
              <button 
                className="btn-guest" 
                onClick={() => setActiveTab('register')}
                style={{marginTop: '10px', fontSize: '0.9rem'}}
              >
                ← Geri Dön
              </button>
            </div>
          )}
        </div>

        {activeTab !== 'verify' && (
          <>
            <div className="social-login-separator">
              <span>veya</span>
            </div>

            <button className="btn-google" onClick={() => window.location.href = "/auth/google"}>
              <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.464 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.464 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
              Google ile Devam Et
            </button>

            <button
              className="btn-guest"
              onClick={() => onLogin({ username: "Misafir" })}
            >
              Misafir Olarak Devam Et
            </button>
          </>
        )}

      </div>
    </div>
  );
}