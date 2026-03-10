import { useState } from "react";

export default function LoginModal({ onLogin, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async () => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      // Token'ı user objesine ekleyerek gönderiyoruz
      onLogin({ ...data.user, token: data.token });
    } else {
      alert(data.error || "Login başarısız");
    }
  };

  const handleRegister = async () => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (data.success) {
      // Register sonrası otomatik giriş (opsiyonel) veya sadece alert
      // onLogin({ ...data.user, token: data.token }); 
      alert("Hesap oluşturuldu! Giriş yapabilirsiniz.");
    } else {
      alert(data.error || "Register başarısız");
    }
  };

  return (
    <div className="login-overlay">

      <div className="login-modal">

        <h2>🦊 WordBoost</h2>

        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div className="login-buttons">

          <button onClick={handleLogin}>Login</button>

          <button onClick={handleRegister}>
            Register
          </button>

          <div className="social-login-separator">
            <span>or</span>
          </div>

          <button className="btn-google" onClick={() => window.location.href = "/auth/google"}>
            <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg"><g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)"><path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/><path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.464 63.239 -14.754 63.239 Z"/><path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.734 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/><path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.464 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/></g></svg>
            Continue with Google
          </button>

          <button
            className="btn-guest"
            onClick={() => onLogin({ username: "Guest" })}
          >
            Continue as Guest
          </button>

          <button className="close-btn" onClick={onClose}>
            ✕
          </button>

        </div>

      </div>

    </div>
  );
}