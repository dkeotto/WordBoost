import { useState, useEffect, useCallback } from "react";
import "./AdminPanel.css";

const STORAGE_TOKEN_KEY = "wb_admin_token";

export default function AdminPanel({ setCurrentView }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_TOKEN_KEY) || "");
  const [username, setUsername] = useState(() => localStorage.getItem("wb_admin_user") || "dkeotto");
  const [password, setPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(() => Boolean(sessionStorage.getItem(STORAGE_TOKEN_KEY)));
  const [summary, setSummary] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [levels, setLevels] = useState(null);
  const [activity, setActivity] = useState(null);
  const [wordQuality, setWordQuality] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [single, setSingle] = useState({
    term: "",
    meaning: "",
    hint: "",
    example: "",
    level: "B1"
  });
  const [csvText, setCsvText] = useState("");

  const headers = () => ({
    "Content-Type": "application/json",
    "X-Admin-Token": token
  });

  const loadAll = useCallback(async () => {
    if (!token) {
      setErr("Admin oturumu gerekli.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
      const h = headers();
      const [s, d, lv, act, q] = await Promise.all([
        fetch("/api/admin/summary", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/word-difficulty?limit=50&sort=unknown", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/levels", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/activity?days=7&limit=50", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/word-quality?limit=20", { headers: h }).then((r) => r.json())
      ]);
      if (s.error) {
        setErr(s.error);
        setSummary(null);
      } else {
        setSummary(s);
      }
      if (d.error) {
        setErr(d.error);
        setDifficulty(null);
      } else {
        setDifficulty(d);
      }
      if (lv.error) setLevels(null);
      else setLevels(lv);
      if (act.error) setActivity(null);
      else setActivity(act);
      if (q.error) setWordQuality(null);
      else setWordQuality(q);
    } catch (e) {
      setErr(e.message || "İstek başarısız");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const t = sessionStorage.getItem(STORAGE_TOKEN_KEY);
    if (!t) return;
    setToken(t);
    setIsAuthed(true);
    setLoading(true);
    const h = { "Content-Type": "application/json", "X-Admin-Token": t };
    Promise.all([
      fetch("/api/admin/summary", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/word-difficulty?limit=50&sort=unknown", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/levels", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/activity?days=7&limit=50", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/word-quality?limit=20", { headers: h }).then((r) => r.json())
    ])
      .then(([s, d, lv, act, q]) => {
        if (s.error) {
          setErr(s.error);
          setIsAuthed(false);
          sessionStorage.removeItem(STORAGE_TOKEN_KEY);
        }
        else setSummary(s);
        if (d.error) setErr(d.error);
        else setDifficulty(d);
        if (!lv.error) setLevels(lv);
        if (!act.error) setActivity(act);
        if (!q.error) setWordQuality(q);
      })
      .catch((e) => setErr(e.message || "İstek başarısız"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Giriş başarısız");
      setToken(data.token);
      setIsAuthed(true);
      sessionStorage.setItem(STORAGE_TOKEN_KEY, data.token);
      localStorage.setItem("wb_admin_user", username);
      setPassword("");
      setMsg("Giriş başarılı.");
      setTimeout(() => loadAll(), 50);
    } catch (e2) {
      setErr(e2.message);
      setIsAuthed(false);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken("");
    setIsAuthed(false);
    sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    setSummary(null);
    setDifficulty(null);
    setLevels(null);
    setActivity(null);
    setWordQuality(null);
    setMsg("Çıkış yapıldı.");
  };

  const addWord = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admin/words", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(single)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata");
      setMsg("Kelime eklendi.");
      setSingle({ ...single, term: "", meaning: "", hint: "", example: "" });
      loadAll();
    } catch (e) {
      setErr(e.message);
    }
  };

  const importCsv = async (e) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admin/words/import", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ csv: csvText })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hata");
      setMsg(
        `İçe aktarıldı: ${data.inserted} eklendi, ${data.skipped} atlandı. Hata: ${data.errorCount || 0}`
      );
      setCsvText("");
      loadAll();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h2>Yönetim paneli</h2>
        <button type="button" className="admin-back" onClick={() => setCurrentView("practice")}>
          ← Uygulamaya dön
        </button>
      </div>

      {!isAuthed && (
        <form className="admin-login-card" onSubmit={login}>
          <h3>Admin Girişi</h3>
          <p className="admin-hint">Bu alan gizli yönetim erişimi içindir.</p>
          <input
            className="admin-input-wide"
            placeholder="Kullanıcı adı"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
          <input
            className="admin-input-wide"
            type="password"
            placeholder="Şifre"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button type="submit" disabled={loading}>{loading ? "Giriş yapılıyor..." : "Giriş Yap"}</button>
        </form>
      )}

      {isAuthed && (
        <div className="admin-key-row">
          <div className="admin-session-ok">✅ Oturum açık</div>
          <button type="button" onClick={loadAll} disabled={loading}>
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
          <button type="button" className="admin-logout-btn" onClick={logout}>
            Çıkış Yap
          </button>
        </div>
      )}

      {err && <div className="admin-error">{err}</div>}
      {msg && <div className="admin-msg">{msg}</div>}

      {isAuthed && summary && (
        <section className="admin-section">
          <h3>Özet</h3>
          <ul className="admin-stats">
            <li>Kullanıcı sayısı: <strong>{summary.userCount}</strong></li>
            <li>Kelime (DB): <strong>{summary.wordCount}</strong></li>
            <li>Kelime istatistik kaydı: <strong>{summary.wordStatDocuments}</strong></li>
            <li>Uptime: <strong>{summary.uptimeSec}s</strong></li>
            <li>RAM (RSS): <strong>{summary.rssMb} MB</strong></li>
          </ul>
          {summary.recentErrors && summary.recentErrors.length > 0 && (
            <div className="admin-errors">
              <h4>Son hata kayıtları (bellek)</h4>
              <pre className="admin-pre">
                {summary.recentErrors.map((x, i) => (
                  <span key={i}>
                    {x.t} {x.msg} {x.path ? `(${x.path})` : ""}
                    {"\n"}
                  </span>
                ))}
              </pre>
            </div>
          )}
        </section>
      )}

      {isAuthed && difficulty && difficulty.items && (
        <section className="admin-section">
          <h3>En çok “bilinmiyor” işaretlenen kelimeler</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Kelime</th>
                  <th>Bilinmiyor</th>
                  <th>Bildim</th>
                </tr>
              </thead>
              <tbody>
                {difficulty.items.map((row) => (
                  <tr key={row.termNorm || row._id}>
                    <td>{row.term}</td>
                    <td>{row.unknownCount}</td>
                    <td>{row.knownCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAuthed && levels && levels.items && (
        <section className="admin-section">
          <h3>Seviyelere göre kelime dağılımı</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Seviye</th>
                  <th>Kelime sayısı</th>
                </tr>
              </thead>
              <tbody>
                {levels.items.map((row) => (
                  <tr key={row.level}>
                    <td>{row.level}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAuthed && activity && (
        <section className="admin-section">
          <h3>Aktif kullanıcılar (son {activity.days} gün)</h3>
          <ul className="admin-stats">
            <li>Aktif kullanıcı sayısı: <strong>{activity.activeCount}</strong></li>
          </ul>
          <div className="admin-two-col">
            <div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Kullanıcı</th>
                      <th>Streak</th>
                      <th>Son çalışma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activity.activeUsers || []).map((u) => (
                      <tr key={u._id || u.username}>
                        <td>{u.username || u.nickname}</td>
                        <td>{u.streak}</td>
                        <td>{u.lastStudyDate ? new Date(u.lastStudyDate).toLocaleDateString() : "-"}</td>
                      </tr>
                    ))}
                    {(activity.activeUsers || []).length === 0 && (
                      <tr>
                        <td colSpan={3}>Aktif kullanıcı yok</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="admin-small" style={{ marginBottom: "0.6rem" }}>
                Streak dağılımı
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Streak</th>
                      <th>Kişi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activity.streakBuckets || []).map((b, idx) => (
                      <tr key={String(b.streak) + idx}>
                        <td>{b.streak}</td>
                        <td>{b.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {isAuthed && wordQuality && (
        <section className="admin-section">
          <h3>Kelime zorluk / başarı özeti</h3>
          <ul className="admin-stats">
            <li>Genel başarı oranı: <strong>{(wordQuality.successRate * 100).toFixed(1)}%</strong></li>
            <li>Toplam bilinen sayısı: <strong>{wordQuality.totals?.sumKnown ?? 0}</strong></li>
            <li>Toplam bilinmeyen sayısı: <strong>{wordQuality.totals?.sumUnknown ?? 0}</strong></li>
            <li>WordStat kaydı: <strong>{wordQuality.totals?.wordStatDocuments ?? 0}</strong></li>
          </ul>
          <div className="admin-two-col">
            <div>
              <h4 style={{ marginTop: 0, color: "#ff7b4a" }}>En zor kelimeler</h4>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Kelime</th>
                      <th>Bilinmeyen</th>
                      <th>Bilinen</th>
                      <th>Oran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wordQuality.hardest || []).map((row) => (
                      <tr key={row.termNorm || row.term}>
                        <td>{row.term}</td>
                        <td>{row.unknownCount}</td>
                        <td>{row.knownCount}</td>
                        <td>{(row.unknownRatio * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {(wordQuality.hardest || []).length === 0 && (
                      <tr>
                        <td colSpan={4}>Veri yok</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h4 style={{ marginTop: 0, color: "#7bf0aa" }}>En kolay kelimeler</h4>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Kelime</th>
                      <th>Bilinen</th>
                      <th>Bilinmeyen</th>
                      <th>Oran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wordQuality.easiest || []).map((row) => (
                      <tr key={row.termNorm || row.term}>
                        <td>{row.term}</td>
                        <td>{row.knownCount}</td>
                        <td>{row.unknownCount}</td>
                        <td>{(row.knownRatio * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                    {(wordQuality.easiest || []).length === 0 && (
                      <tr>
                        <td colSpan={4}>Veri yok</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      {isAuthed && <section className="admin-section">
        <h3>Tek kelime ekle</h3>
        <form className="admin-form" onSubmit={addWord}>
          <input
            placeholder="term (İngilizce)"
            value={single.term}
            onChange={(e) => setSingle({ ...single, term: e.target.value })}
            required
          />
          <input
            placeholder="meaning (Türkçe)"
            value={single.meaning}
            onChange={(e) => setSingle({ ...single, meaning: e.target.value })}
            required
          />
          <input
            placeholder="hint (isteğe bağlı)"
            value={single.hint}
            onChange={(e) => setSingle({ ...single, hint: e.target.value })}
          />
          <input
            placeholder="example (isteğe bağlı)"
            value={single.example}
            onChange={(e) => setSingle({ ...single, example: e.target.value })}
          />
          <select
            value={single.level}
            onChange={(e) => setSingle({ ...single, level: e.target.value })}
          >
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((lv) => (
              <option key={lv} value={lv}>
                {lv}
              </option>
            ))}
          </select>
          <button type="submit">Ekle</button>
        </form>
      </section>}

      {isAuthed && <section className="admin-section">
        <h3>CSV içe aktar</h3>
        <p className="admin-small">
          İlk satır başlık: <code>term,meaning,hint,example,level</code> — hint/example opsiyonel.
        </p>
        <form onSubmit={importCsv}>
          <textarea
            className="admin-csv"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`term,meaning,hint,example,level\nhello,merhaba,,,B1`}
            rows={10}
          />
          <button type="submit">CSV yükle</button>
        </form>
      </section>}
    </div>
  );
}
