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

  const [usersMeta, setUsersMeta] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersPages, setUsersPages] = useState(1);
  const [userLimit, setUserLimit] = useState(25);
  const [userQInput, setUserQInput] = useState("");
  const [userQ, setUserQ] = useState("");
  const [userSort, setUserSort] = useState("createdAt");
  const [userOrder, setUserOrder] = useState("desc");
  const [userFilterVerified, setUserFilterVerified] = useState(""); // '' | 'true' | 'false'
  const [userFilterOauth, setUserFilterOauth] = useState(""); // '' | 'google' | 'local'
  const [usersLoading, setUsersLoading] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    studied: "",
    known: "",
    unknown: "",
    streak: "",
    lastStudyDate: "",
    badgesText: ""
  });
  const [editSaving, setEditSaving] = useState(false);

  const headers = () => ({
    "Content-Type": "application/json",
    "X-Admin-Token": token
  });

  const buildUsersQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(usersPage));
    p.set("limit", String(userLimit));
    p.set("sort", userSort);
    p.set("order", userOrder);
    const qv = userQ.trim();
    if (qv) p.set("q", qv);
    if (userFilterVerified) p.set("verified", userFilterVerified);
    if (userFilterOauth) p.set("oauth", userFilterOauth);
    return p.toString();
  }, [usersPage, userLimit, userQ, userSort, userOrder, userFilterVerified, userFilterOauth]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    try {
      const h = headers();
      const [meta, list] = await Promise.all([
        fetch("/api/admin/users/meta", { headers: h }).then((r) => r.json()),
        fetch(`/api/admin/users?${buildUsersQuery()}`, { headers: h }).then((r) => r.json())
      ]);
      if (!meta.error) setUsersMeta(meta);
      if (list.error) {
        setErr(list.error);
        setUsersList([]);
      } else {
        setUsersList(list.items || []);
        setUsersTotal(list.total ?? 0);
        setUsersPages(list.pages ?? 1);
      }
    } catch (e) {
      setErr(e.message || "Kullanıcı listesi yüklenemedi");
    } finally {
      setUsersLoading(false);
    }
  }, [token, buildUsersQuery]);

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
      const [s, d, lv, act, wq] = await Promise.all([
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
      if (wq.error) setWordQuality(null);
      else setWordQuality(wq);
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
      .then(([s, d, lv, act, wq]) => {
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
        if (!wq.error) setWordQuality(wq);
      })
      .catch((e) => setErr(e.message || "İstek başarısız"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setUserQ(userQInput.trim()), 400);
    return () => clearTimeout(t);
  }, [userQInput]);

  useEffect(() => {
    setUsersPage(1);
  }, [userQ, userFilterVerified, userFilterOauth, userLimit, userSort, userOrder]);

  useEffect(() => {
    if (!isAuthed || !token) return;
    loadUsers();
  }, [isAuthed, token, loadUsers]);

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
    setUsersMeta(null);
    setUsersList([]);
    setUsersTotal(0);
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

  const openEdit = (u) => {
    setErr("");
    setMsg("");
    setEditUser(u);
    setEditForm({
      studied: String(u?.stats?.studied ?? 0),
      known: String(u?.stats?.known ?? 0),
      unknown: String(u?.stats?.unknown ?? 0),
      streak: String(u?.streak ?? 0),
      lastStudyDate: u?.lastStudyDate ? new Date(u.lastStudyDate).toISOString().slice(0, 16) : "",
      badgesText: (u?.badges || []).join(", ")
    });
  };

  const closeEdit = () => {
    setEditUser(null);
    setEditSaving(false);
  };

  const saveEdit = async () => {
    if (!editUser?._id) return;
    setEditSaving(true);
    setErr("");
    setMsg("");
    try {
      const payload = {
        stats: {
          studied: Number(editForm.studied),
          known: Number(editForm.known),
          unknown: Number(editForm.unknown)
        },
        streak: Number(editForm.streak),
        lastStudyDate: editForm.lastStudyDate ? new Date(editForm.lastStudyDate).toISOString() : null,
        badges: editForm.badgesText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      };
      const res = await fetch(`/api/admin/users/${editUser._id}/stats`, {
        method: "PUT",
        headers: headers(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydetme başarısız");
      setMsg(`Güncellendi: ${editUser.username}`);
      closeEdit();
      loadUsers();
    } catch (e) {
      setErr(e.message || "Kaydetme başarısız");
    } finally {
      setEditSaving(false);
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

      {isAuthed && summary?.serverMetrics && (
        <section className="admin-section">
          <h3>Sunucu &amp; kaynak</h3>
          <p className="admin-small">
            Node süreci ve işletim sistemi (Railway konteynerinde paylaşımlı kaynaklar).
          </p>
          <div className="admin-metrics-grid">
            <div className="admin-metric-card">
              <span className="admin-metric-label">Node heap (kullanılan)</span>
              <strong>{summary.serverMetrics.heapUsedMb} MB</strong>
              <span className="admin-metric-sub">toplam heap {summary.serverMetrics.heapTotalMb} MB</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-label">RSS (process)</span>
              <strong>{summary.serverMetrics.rssMb} MB</strong>
              <span className="admin-metric-sub">external {summary.serverMetrics.externalMb} MB</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-label">Sistem RAM</span>
              <strong>
                {summary.serverMetrics.systemUsedMemPercent}% kullanımda
              </strong>
              <span className="admin-metric-sub">
                boş {summary.serverMetrics.systemFreeMemMb} / {summary.serverMetrics.systemTotalMemMb} MB
              </span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-label">Process CPU (yaklaşık)</span>
              <strong>
                {summary.serverMetrics.processCpuPercent != null
                  ? `${summary.serverMetrics.processCpuPercent}%`
                  : "—"}
              </strong>
              <span className="admin-metric-sub">çekirdek: {summary.serverMetrics.cpuCores}</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-label">Load average (1/5/15 dk)</span>
              <strong>
                {(summary.serverMetrics.loadAvg || []).map((x) => Number(x).toFixed(2)).join(" / ")}
              </strong>
              <span className="admin-metric-sub">{summary.serverMetrics.platform} · {summary.serverMetrics.arch}</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-label">Socket.IO bağlantı</span>
              <strong>{summary.serverMetrics.socketConnections}</strong>
              <span className="admin-metric-sub">PID {summary.serverMetrics.pid} · {summary.serverMetrics.nodeVersion}</span>
            </div>
            <div className="admin-metric-card admin-metric-card-wide">
              <span className="admin-metric-label">Host</span>
              <strong>{summary.serverMetrics.hostname}</strong>
              <span className="admin-metric-sub">{summary.serverMetrics.release}</span>
            </div>
          </div>
        </section>
      )}

      {isAuthed && usersMeta && (
        <section className="admin-section">
          <h3>Kullanıcı özeti (veritabanı)</h3>
          <div className="admin-chip-row">
            <span className="admin-chip">Toplam: <strong>{usersMeta.total}</strong></span>
            <span className="admin-chip">E-posta kayıtlı: <strong>{usersMeta.withEmail}</strong></span>
            <span className="admin-chip">E-posta doğrulanmış: <strong>{usersMeta.verified}</strong></span>
            <span className="admin-chip">Google bağlı: <strong>{usersMeta.googleLinked}</strong></span>
            <span className="admin-chip">Şifre (yerel): <strong>{usersMeta.withPassword}</strong></span>
          </div>
        </section>
      )}

      {isAuthed && (
        <section className="admin-section">
          <h3>Kullanıcı listesi &amp; arama</h3>
          <div className="admin-users-toolbar">
            <input
              className="admin-input-wide"
              placeholder="Kullanıcı adı, rumuz veya e-posta ara…"
              value={userQInput}
              onChange={(e) => setUserQInput(e.target.value)}
            />
            <select
              className="admin-select"
              value={userFilterVerified}
              onChange={(e) => setUserFilterVerified(e.target.value)}
              aria-label="E-posta doğrulama"
            >
              <option value="">Tüm doğrulama durumları</option>
              <option value="true">Doğrulanmış</option>
              <option value="false">Doğrulanmamış</option>
            </select>
            <select
              className="admin-select"
              value={userFilterOauth}
              onChange={(e) => setUserFilterOauth(e.target.value)}
              aria-label="Giriş türü"
            >
              <option value="">Tüm giriş türleri</option>
              <option value="google">Google</option>
              <option value="local">E-posta / şifre</option>
            </select>
            <select
              className="admin-select"
              value={userSort}
              onChange={(e) => setUserSort(e.target.value)}
              aria-label="Sırala"
            >
              <option value="createdAt">Kayıt tarihi</option>
              <option value="lastStudyDate">Son çalışma</option>
              <option value="streak">Streak</option>
              <option value="username">Kullanıcı adı</option>
            </select>
            <select
              className="admin-select"
              value={userOrder}
              onChange={(e) => setUserOrder(e.target.value)}
              aria-label="Sıra"
            >
              <option value="desc">Azalan</option>
              <option value="asc">Artan</option>
            </select>
            <select
              className="admin-select"
              value={userLimit}
              onChange={(e) => setUserLimit(Number(e.target.value))}
              aria-label="Sayfa başına"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / sayfa
                </option>
              ))}
            </select>
            <button type="button" onClick={() => loadUsers()} disabled={usersLoading}>
              {usersLoading ? "…" : "Listeyi yenile"}
            </button>
          </div>
          <p className="admin-small">
            Toplam {usersTotal} kayıt · sayfa {usersPage} / {usersPages}
            {usersLoading ? " · yükleniyor…" : ""}
          </p>
          <div className="admin-table-wrap admin-users-table-wrap">
            <table className="admin-table admin-users-table">
              <thead>
                <tr>
                  <th>Kullanıcı</th>
                  <th>Rumuz</th>
                  <th>E-posta</th>
                  <th>Doğr.</th>
                  <th>Google</th>
                  <th>Şifre</th>
                  <th>Çalışılan</th>
                  <th>Bildi</th>
                  <th>Bilmedi</th>
                  <th>Streak</th>
                  <th>Son çalışma</th>
                  <th>Kayıt</th>
                  <th>Rozet</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u) => (
                  <tr key={String(u._id)}>
                    <td>
                      <span className="admin-user-cell">
                        {u.avatar && (u.avatar.startsWith("http") || u.avatar.startsWith("data:")) ? (
                          <img src={u.avatar} alt="" className="admin-user-avatar" />
                        ) : null}
                        <span>{u.username}</span>
                      </span>
                    </td>
                    <td>{u.nickname || "—"}</td>
                    <td className="admin-td-mono">{u.email || "—"}</td>
                    <td>{u.isVerified ? "✓" : "—"}</td>
                    <td>{u.hasGoogle ? "✓" : "—"}</td>
                    <td>{u.hasPassword ? "✓" : "—"}</td>
                    <td>{u.stats?.studied ?? 0}</td>
                    <td>{u.stats?.known ?? 0}</td>
                    <td>{u.stats?.unknown ?? 0}</td>
                    <td>{u.streak ?? 0}</td>
                    <td className="admin-td-nowrap">
                      {u.lastStudyDate
                        ? new Date(u.lastStudyDate).toLocaleString("tr-TR")
                        : "—"}
                    </td>
                    <td className="admin-td-nowrap">
                      {u.createdAt ? new Date(u.createdAt).toLocaleString("tr-TR") : "—"}
                    </td>
                    <td className="admin-badges-cell" title={(u.badges || []).join(", ")}>
                      {(u.badges || []).length ? `${(u.badges || []).length} adet` : "—"}
                    </td>
                    <td>
                      <button type="button" onClick={() => openEdit(u)}>
                        Düzenle
                      </button>
                    </td>
                  </tr>
                ))}
                {usersList.length === 0 && !usersLoading && (
                  <tr>
                    <td colSpan={14}>Kayıt yok veya filtrelere uymuyor.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-pagination">
            <button
              type="button"
              disabled={usersPage <= 1 || usersLoading}
              onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
            >
              ← Önceki
            </button>
            <span>
              {usersPage} / {usersPages}
            </span>
            <button
              type="button"
              disabled={usersPage >= usersPages || usersLoading}
              onClick={() => setUsersPage((p) => p + 1)}
            >
              Sonraki →
            </button>
          </div>
        </section>
      )}

      {isAuthed && editUser && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal">
            <div className="admin-modal-header">
              <h3>Kullanıcı düzenle</h3>
              <button type="button" className="admin-modal-close" onClick={closeEdit} aria-label="Kapat">
                ✕
              </button>
            </div>
            <p className="admin-small">
              <strong>{editUser.username}</strong> ({editUser.email || "e-posta yok"})
            </p>
            <div className="admin-modal-grid">
              <label>
                Çalışılan (studied)
                <input
                  value={editForm.studied}
                  onChange={(e) => setEditForm((f) => ({ ...f, studied: e.target.value }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Bildi (known)
                <input
                  value={editForm.known}
                  onChange={(e) => setEditForm((f) => ({ ...f, known: e.target.value }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Bilmedi (unknown)
                <input
                  value={editForm.unknown}
                  onChange={(e) => setEditForm((f) => ({ ...f, unknown: e.target.value }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Seri (streak)
                <input
                  value={editForm.streak}
                  onChange={(e) => setEditForm((f) => ({ ...f, streak: e.target.value }))}
                  inputMode="numeric"
                />
              </label>
              <label>
                Son çalışma (opsiyonel)
                <input
                  type="datetime-local"
                  value={editForm.lastStudyDate}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastStudyDate: e.target.value }))}
                />
              </label>
              <label className="admin-modal-wide">
                Rozetler (virgülle ayır)
                <input
                  value={editForm.badgesText}
                  onChange={(e) => setEditForm((f) => ({ ...f, badgesText: e.target.value }))}
                  placeholder="newbie, streak_7, known_100"
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-secondary" onClick={closeEdit} disabled={editSaving}>
                Vazgeç
              </button>
              <button type="button" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
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
