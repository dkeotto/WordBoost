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
      onLogin(data.user);
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

          <button
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