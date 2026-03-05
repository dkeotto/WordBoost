import { useState } from "react";

export default function LoginModal({ onLogin, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  async function handleLogin() {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!data.success) {
      setError(data.error || "Login failed");
      return;
    }

    if (remember) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    } else {
      sessionStorage.setItem("token", data.token);
    }

    onLogin(data.user);
  }

  function guest() {
    onLogin({ username: "Guest", guest: true });
  }

  return (
    <div className="modal-overlay">
      <div className="login-modal">

        <h2>WordBoost</h2>

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

        <label className="remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={() => setRemember(!remember)}
          />
          Beni hatırla
        </label>

        {error && <div className="error">{error}</div>}

        <button className="login-btn" onClick={handleLogin}>
          Login
        </button>

        <button className="guest-btn" onClick={guest}>
          Continue as Guest
        </button>

        <button className="close-btn" onClick={onClose}>
          ✕
        </button>

      </div>
    </div>
  );
}