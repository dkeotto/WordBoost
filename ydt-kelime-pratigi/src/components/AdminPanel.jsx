import { useState, useEffect, useCallback } from "react";
import "./AdminPanel.css";

const STORAGE_KEY = "wb_admin_key";

export default function AdminPanel({ setCurrentView }) {
  const [key, setKey] = useState(() => sessionStorage.getItem(STORAGE_KEY) || "");
  const [summary, setSummary] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
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
    "X-Admin-Key": key
  });

  const loadAll = useCallback(async () => {
    if (!key || key.length < 12) {
      setErr("Admin anahtarı en az 12 karakter (Railway ADMIN_SECRET ile aynı)");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      sessionStorage.setItem(STORAGE_KEY, key);
      const h = headers();
      const [s, d] = await Promise.all([
        fetch("/api/admin/summary", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/word-difficulty?limit=50", { headers: h }).then((r) => r.json())
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
    } catch (e) {
      setErr(e.message || "İstek başarısız");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    const k = sessionStorage.getItem(STORAGE_KEY);
    if (!k || k.length < 12) return;
    setKey(k);
    setLoading(true);
    const h = { "Content-Type": "application/json", "X-Admin-Key": k };
    Promise.all([
      fetch("/api/admin/summary", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/word-difficulty?limit=50", { headers: h }).then((r) => r.json())
    ])
      .then(([s, d]) => {
        if (s.error) setErr(s.error);
        else setSummary(s);
        if (d.error) setErr(d.error);
        else setDifficulty(d);
      })
      .catch((e) => setErr(e.message || "İstek başarısız"))
      .finally(() => setLoading(false));
  }, []);

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

      <p className="admin-hint">
        Railway’de <code>ADMIN_SECRET</code> tanımlı olmalı. Aynı değeri aşağıya yaz; tarayıcıda{" "}
        <strong>saklanır</strong> (sadece bu cihaz).
      </p>

      <div className="admin-key-row">
        <input
          type="password"
          autoComplete="off"
          placeholder="ADMIN_SECRET (X-Admin-Key)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="admin-input-wide"
        />
        <button type="button" onClick={loadAll} disabled={loading}>
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </div>

      {err && <div className="admin-error">{err}</div>}
      {msg && <div className="admin-msg">{msg}</div>}

      {summary && (
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

      {difficulty && difficulty.items && (
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

      <section className="admin-section">
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
      </section>

      <section className="admin-section">
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
      </section>
    </div>
  );
}
