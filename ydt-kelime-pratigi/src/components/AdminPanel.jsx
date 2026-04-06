import { useState, useEffect, useCallback, useMemo } from "react";
import "./AdminPanel.css";

const STORAGE_TOKEN_KEY = "wb_admin_token";

function aiLegLabel(id) {
  if (id === "groq") return "Groq";
  if (id === "ai_gateway") return "AI Gateway (Vercel)";
  if (id === "anthropic") return "Anthropic";
  return String(id || "—");
}

function aiRuntimeLabel(name) {
  if (name === "failover") return "Otomatik yedekleme (Groq ↔ Gateway)";
  if (name === "groq") return "Yalnız Groq";
  if (name === "ai_gateway") return "Yalnız AI Gateway";
  if (name === "anthropic") return "Anthropic Claude";
  return name || "—";
}

export default function AdminPanel({ setCurrentView }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(STORAGE_TOKEN_KEY) || "");
  const [username, setUsername] = useState(() => localStorage.getItem("wb_admin_user") || "");
  const [password, setPassword] = useState("");
  const [isAuthed, setIsAuthed] = useState(() => Boolean(sessionStorage.getItem(STORAGE_TOKEN_KEY)));
  const [summary, setSummary] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [levels, setLevels] = useState(null);
  const [activity, setActivity] = useState(null);
  const [wordQuality, setWordQuality] = useState(null);
  const [aiProviders, setAiProviders] = useState(null);
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

  const [wordsList, setWordsList] = useState([]);
  const [wordsTotal, setWordsTotal] = useState(0);
  const [wordsPage, setWordsPage] = useState(1);
  const [wordsPages, setWordsPages] = useState(1);
  const [wordsLimit, setWordsLimit] = useState(25);
  const [wordQInput, setWordQInput] = useState("");
  const [wordQ, setWordQ] = useState("");
  const [wordLevelFilter, setWordLevelFilter] = useState("");
  const [wordsLoading, setWordsLoading] = useState(false);
  const [editWord, setEditWord] = useState(null);
  const [editWordForm, setEditWordForm] = useState({ term: "", meaning: "", hint: "", example: "", level: "B1" });
  const [editWordSaving, setEditWordSaving] = useState(false);

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
  const [userFilterPremium, setUserFilterPremium] = useState(""); // '' | 'active' | 'none' | 'aiplus'
  const [usersLoading, setUsersLoading] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    studied: "",
    known: "",
    unknown: "",
    streak: "",
    lastStudyDate: "",
    badgesText: "",
    premiumUntilLocal: "",
    aiPlus: false
  });
  const [editSaving, setEditSaving] = useState(false);
  const [premiumSaving, setPremiumSaving] = useState(false);

  const [classrooms, setClassrooms] = useState([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [teachersPick, setTeachersPick] = useState([]);
  const [classFilterQ, setClassFilterQ] = useState("");
  const [classForm, setClassForm] = useState({
    name: "",
    teacherId: "",
    description: "",
    schoolName: "",
    gradeLabel: "",
    orgGroup: "",
    tagsText: "",
    adminNote: "",
  });
  const [classSaving, setClassSaving] = useState(false);
  const [editClassroom, setEditClassroom] = useState(null);
  const [editClassForm, setEditClassForm] = useState({});

  const h = useMemo(
    () => ({
      "Content-Type": "application/json",
      "X-Admin-Token": token
    }),
    [token]
  );

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
    if (userFilterPremium) p.set("premium", userFilterPremium);
    return p.toString();
  }, [usersPage, userLimit, userQ, userSort, userOrder, userFilterVerified, userFilterOauth, userFilterPremium]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setUsersLoading(true);
    try {
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
  }, [token, buildUsersQuery, h]);

  const loadAll = useCallback(async () => {
    if (!token) {
      setErr("Admin oturumu gerekli.");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
      const [s, d, lv, act, wq, aiP] = await Promise.all([
        fetch("/api/admin/summary", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/word-difficulty?limit=50&sort=unknown", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/levels", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/activity?days=7&limit=50", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/word-quality?limit=20", { headers: h }).then((r) => r.json()),
        fetch("/api/admin/ai-providers", { headers: h }).then((r) => r.json())
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
      if (!aiP.error) setAiProviders(aiP);
      else setAiProviders(null);
    } catch (e) {
      setErr(e.message || "İstek başarısız");
    } finally {
      setLoading(false);
    }
  }, [token, h]);

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
      fetch("/api/admin/word-quality?limit=20", { headers: h }).then((r) => r.json()),
      fetch("/api/admin/ai-providers", { headers: h }).then((r) => r.json())
    ])
      .then(([s, d, lv, act, wq, aiP]) => {
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
        if (!aiP.error) setAiProviders(aiP);
      })
      .catch((e) => setErr(e.message || "İstek başarısız"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setUserQ(userQInput.trim()), 400);
    return () => clearTimeout(t);
  }, [userQInput]);

  useEffect(() => {
    const t = setTimeout(() => setWordQ(wordQInput.trim()), 400);
    return () => clearTimeout(t);
  }, [wordQInput]);

  useEffect(() => {
    setUsersPage(1);
  }, [userQ, userFilterVerified, userFilterOauth, userFilterPremium, userLimit, userSort, userOrder]);

  useEffect(() => {
    setWordsPage(1);
  }, [wordQ, wordLevelFilter, wordsLimit]);

  useEffect(() => {
    if (!isAuthed || !token) return;
    loadUsers();
  }, [isAuthed, token, loadUsers]);

  const buildWordsQuery = useCallback(() => {
    const p = new URLSearchParams();
    p.set("page", String(wordsPage));
    p.set("limit", String(wordsLimit));
    p.set("sort", "updatedAt");
    p.set("order", "desc");
    if (wordQ.trim()) p.set("q", wordQ.trim());
    if (wordLevelFilter) p.set("level", wordLevelFilter);
    return p.toString();
  }, [wordsPage, wordsLimit, wordQ, wordLevelFilter]);

  const loadWords = useCallback(async () => {
    if (!token) return;
    setWordsLoading(true);
    try {
      const r = await fetch(`/api/admin/words?${buildWordsQuery()}`, { headers: h });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Kelimeler yüklenemedi");
      setWordsList(Array.isArray(d.items) ? d.items : []);
      setWordsTotal(d.total ?? 0);
      setWordsPages(d.pages ?? 1);
    } catch (e) {
      setErr(e.message || "Kelimeler yüklenemedi");
    } finally {
      setWordsLoading(false);
    }
  }, [token, h, buildWordsQuery]);

  useEffect(() => {
    if (!isAuthed || !token) return;
    loadWords();
  }, [isAuthed, token, loadWords]);

  const openEditWord = (w) => {
    setErr("");
    setMsg("");
    setEditWord(w);
    setEditWordForm({
      term: w?.term || "",
      meaning: w?.meaning || "",
      hint: w?.hint || "",
      example: w?.example || "",
      level: w?.level || "B1",
    });
  };

  const closeEditWord = () => {
    setEditWord(null);
    setEditWordSaving(false);
  };

  const saveEditWord = async () => {
    if (!editWord?._id) return;
    setEditWordSaving(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/words/${editWord._id}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({
          term: editWordForm.term,
          meaning: editWordForm.meaning,
          hint: editWordForm.hint,
          example: editWordForm.example,
          level: editWordForm.level,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kelime güncellenemedi");
      setMsg("Kelime güncellendi.");
      closeEditWord();
      loadWords();
      loadAll();
    } catch (e) {
      setErr(e.message || "Kelime güncellenemedi");
    } finally {
      setEditWordSaving(false);
    }
  };

  const deleteWord = async (w) => {
    if (!w?._id) return;
    if (!window.confirm(`Silinsin mi?\n\n${w.term} — ${w.meaning}`)) return;
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/admin/words/${w._id}`, { method: "DELETE", headers: h });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Silinemedi");
      setMsg("Kelime silindi.");
      loadWords();
      loadAll();
    } catch (e) {
      setErr(e.message || "Silinemedi");
    }
  };

  useEffect(() => {
    if (!isAuthed || !token) return;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/ai-providers", {
          headers: { "Content-Type": "application/json", "X-Admin-Token": token }
        });
        const d = await r.json();
        if (!d.error) setAiProviders(d);
      } catch {
        /* sessiz */
      }
    };
    tick();
    const id = setInterval(tick, 6000);
    return () => clearInterval(id);
  }, [isAuthed, token]);

  const loadClassrooms = useCallback(async () => {
    if (!token) return;
    setClassroomsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (classFilterQ.trim()) qs.set("q", classFilterQ.trim());
      const qstr = qs.toString();
      const r = await fetch(`/api/admin/classrooms${qstr ? `?${qstr}` : ""}`, { headers: h });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setClassrooms(d.items || []);
    } catch (e) {
      setErr(e.message || "Sınıflar yüklenemedi");
    } finally {
      setClassroomsLoading(false);
    }
  }, [token, h, classFilterQ]);

  useEffect(() => {
    if (!isAuthed || !token) return;
    fetch(`/api/admin/users?role=staff&limit=200&sort=username&order=asc`, { headers: h })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.items)) setTeachersPick(d.items);
      })
      .catch(() => {});
  }, [isAuthed, token, h]);

  useEffect(() => {
    if (!isAuthed || !token) return;
    loadClassrooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ilk yükleme; filtre için "Yenile" kullan
  }, [isAuthed, token]);

  const createClassroom = async (e) => {
    e.preventDefault();
    if (!classForm.name.trim() || !classForm.teacherId) {
      setErr("Sınıf adı ve sorumlu öğretmen seç.");
      return;
    }
    setClassSaving(true);
    setErr("");
    try {
      const tags = classForm.tagsText
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/admin/classrooms", {
        method: "POST",
        headers: h,
        body: JSON.stringify({
          name: classForm.name.trim(),
          teacherId: classForm.teacherId,
          description: classForm.description.trim(),
          schoolName: classForm.schoolName.trim(),
          gradeLabel: classForm.gradeLabel.trim(),
          orgGroup: classForm.orgGroup.trim(),
          tags,
          adminNote: classForm.adminNote.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Oluşturulamadı");
      setMsg(`Sınıf oluşturuldu: ${data.classroom?.name} · kod ${data.classroom?.code}`);
      setClassForm({
        name: "",
        teacherId: "",
        description: "",
        schoolName: "",
        gradeLabel: "",
        orgGroup: "",
        tagsText: "",
        adminNote: "",
      });
      loadClassrooms();
    } catch (err) {
      setErr(err.message || "Sınıf oluşturulamadı");
    } finally {
      setClassSaving(false);
    }
  };

  const openEditClass = (c) => {
    setEditClassroom(c);
    setEditClassForm({
      name: c.name || "",
      teacherId: c.teacherId?._id || c.teacherId || "",
      description: c.description || "",
      schoolName: c.schoolName || "",
      gradeLabel: c.gradeLabel || "",
      orgGroup: c.orgGroup || "",
      tagsText: Array.isArray(c.tags) ? c.tags.join(", ") : "",
      adminNote: c.adminNote || "",
    });
  };

  const saveEditClass = async () => {
    if (!editClassroom) return;
    setClassSaving(true);
    setErr("");
    try {
      const tags = String(editClassForm.tagsText || "")
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`/api/admin/classrooms/${editClassroom._id}`, {
        method: "PATCH",
        headers: h,
        body: JSON.stringify({
          name: editClassForm.name,
          teacherId: editClassForm.teacherId,
          description: editClassForm.description,
          schoolName: editClassForm.schoolName,
          gradeLabel: editClassForm.gradeLabel,
          orgGroup: editClassForm.orgGroup,
          tags,
          adminNote: editClassForm.adminNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      setMsg("Sınıf güncellendi.");
      setEditClassroom(null);
      loadClassrooms();
    } catch (err) {
      setErr(err.message || "Kayıt başarısız");
    } finally {
      setClassSaving(false);
    }
  };

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
        headers: h,
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
        headers: h,
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
      badgesText: (u?.badges || []).join(", "),
      premiumUntilLocal: u?.premiumUntil ? new Date(u.premiumUntil).toISOString().slice(0, 16) : "",
      aiPlus: Boolean(u?.entitlements?.aiPlus)
    });
  };

  const closeEdit = () => {
    setEditUser(null);
    setEditSaving(false);
    setPremiumSaving(false);
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
        headers: h,
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydetme başarısız");
      setMsg(`İstatistik güncellendi: ${editUser.username}`);
      closeEdit();
      loadUsers();
    } catch (e) {
      setErr(e.message || "Kaydetme başarısız");
    } finally {
      setEditSaving(false);
    }
  };

  const setPremiumEnd = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setEditForm((f) => ({ ...f, premiumUntilLocal: d.toISOString().slice(0, 16) }));
  };

  const setPremiumLifetime = () => {
    setEditForm((f) => ({ ...f, premiumUntilLocal: "2099-12-31T23:59" }));
  };

  const clearPremiumEnd = () => {
    setEditForm((f) => ({ ...f, premiumUntilLocal: "" }));
  };

  const savePremium = async () => {
    if (!editUser?._id) return;
    setPremiumSaving(true);
    setErr("");
    setMsg("");
    try {
      const body = {
        premiumUntil: editForm.premiumUntilLocal ? new Date(editForm.premiumUntilLocal).toISOString() : null,
        aiPlus: Boolean(editForm.aiPlus)
      };
      const res = await fetch(`/api/admin/users/${editUser._id}/premium`, {
        method: "PUT",
        headers: h,
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Premium kaydedilemedi");
      setMsg(
        `Manuel premium güncellendi: ${editUser.username} (Premium: ${data.user?.isPremium ? "evet" : "hayır"}, AI+: ${data.user?.hasUnlimitedAi ? "evet" : "hayır"})`
      );
      setEditUser((prev) =>
        prev
          ? {
              ...prev,
              premiumUntil: data.user?.premiumUntil ?? null,
              isPremium: data.user?.isPremium,
              entitlements: data.user?.entitlements || {}
            }
          : prev
      );
      loadUsers();
    } catch (e) {
      setErr(e.message || "Premium kaydedilemedi");
    } finally {
      setPremiumSaving(false);
    }
  };

  return (
    <div className="admin-panel">
      <div className="admin-hero">
        <div className="admin-hero__text">
          <p className="admin-hero__eyebrow">WordBoost</p>
          <h2 className="admin-hero__title">Yönetim paneli</h2>
          <p className="admin-hero__sub">Kullanıcılar, premium, kelime verisi ve sunucu özeti</p>
        </div>
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

      {isAuthed && aiProviders && (
        <section className="admin-section admin-section--ai-providers">
          <h3>AI sağlayıcıları</h3>
          <p className="admin-small">
            Çalışma modu: <strong>{aiRuntimeLabel(aiProviders.runtimeName)}</strong>
            {aiProviders.failoverEnabled ? (
              <>
                {" "}
                · Öncelik: <strong>{aiLegLabel(aiProviders.failoverPrimary)}</strong> (limit 429, geçersiz anahtar 401/403
                veya sunucu 5xx olursa diğer uç denenir)
              </>
            ) : null}
            . Metrikler gerçek trafikten güncellenir; yaklaşık 6 sn&apos;de bir yenilenir.
          </p>
          {aiProviders.lastRequest && (
            <p className="admin-small admin-ai-last-req">
              Son AI isteği: <strong>{aiLegLabel(aiProviders.lastRequest.provider)}</strong>
              {aiProviders.lastRequest.rateLimited ? " (hız limiti)" : ""}
              {aiProviders.lastRequest.at
                ? ` · ${new Date(aiProviders.lastRequest.at).toLocaleString("tr-TR")}`
                : ""}
            </p>
          )}
          <div className="admin-ai-legs">
            {(aiProviders.legs || []).map((leg) => (
              <div
                key={leg.id}
                className={`admin-ai-leg admin-ai-leg--${leg.status === "rate_limit" ? "limit" : leg.status === "hata" ? "err" : leg.status === "ok" ? "ok" : "idle"}`}
              >
                <div className="admin-ai-leg__title">{aiLegLabel(leg.id)}</div>
                <div className="admin-ai-leg__model">
                  Model: <code>{leg.model || "—"}</code>
                </div>
                <div className="admin-ai-leg__row">
                  Durum:{" "}
                  <strong>
                    {leg.status === "rate_limit"
                      ? `Hız limiti (~${Math.max(1, Math.ceil(leg.rateLimitedRemainingMs / 1000))} sn)`
                      : leg.status === "ok"
                        ? "Son olay: başarılı"
                        : leg.status === "hata"
                          ? "Son olay: hata"
                          : "Henüz trafik yok"}
                  </strong>
                </div>
                {leg.limitRemaining != null && leg.limitRemaining !== "" && (
                  <div className="admin-ai-leg__row admin-ai-leg__muted">
                    Son yanıttaki kota (varsa): kalan <code>{leg.limitRemaining}</code>
                    {leg.limitReset ? ` · reset: ${leg.limitReset}` : ""}
                  </div>
                )}
                <div className="admin-ai-leg__row admin-ai-leg__muted">
                  Başarılı çağrı (sayacı): {leg.requestsOk ?? 0}
                </div>
                {leg.lastSuccessAt && (
                  <div className="admin-ai-leg__muted">
                    Son başarı: {new Date(leg.lastSuccessAt).toLocaleString("tr-TR")}
                  </div>
                )}
                {leg.lastErrorAt && leg.lastErrorMessage && (
                  <div className="admin-ai-leg__err">
                    Son hata ({new Date(leg.lastErrorAt).toLocaleString("tr-TR")}): {leg.lastErrorMessage}
                  </div>
                )}
              </div>
            ))}
          </div>
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
        <section className="admin-section admin-section--premium-overview">
          <h3>Kullanıcı &amp; premium özeti</h3>
          <p className="admin-small">Aktif premium: <code>premiumUntil</code> şu andan sonra olan kullanıcılar. AI+: manuel veya Paddle ile işaretlenmiş sınırsız AI modu.</p>
          <div className="admin-stat-cards">
            <div className="admin-stat-card">
              <span className="admin-stat-card__label">Kayıtlı kullanıcı</span>
              <strong className="admin-stat-card__value">{usersMeta.total}</strong>
            </div>
            <div className="admin-stat-card admin-stat-card--accent">
              <span className="admin-stat-card__label">Aktif premium</span>
              <strong className="admin-stat-card__value">{usersMeta.premiumActive ?? 0}</strong>
              <span className="admin-stat-card__hint">Şu an geçerli abonelik / manuel tarih</span>
            </div>
            <div className="admin-stat-card admin-stat-card--ai">
              <span className="admin-stat-card__label">AI+ yetkili</span>
              <strong className="admin-stat-card__value">{usersMeta.aiPlusEntitled ?? 0}</strong>
              <span className="admin-stat-card__hint">entitlements.aiPlus</span>
            </div>
            <div className="admin-stat-card">
              <span className="admin-stat-card__label">Doğrulanmış e-posta</span>
              <strong className="admin-stat-card__value">{usersMeta.verified}</strong>
            </div>
          </div>
          <div className="admin-chip-row admin-chip-row--tight">
            <span className="admin-chip">E-posta kayıtlı: <strong>{usersMeta.withEmail}</strong></span>
            <span className="admin-chip">Google: <strong>{usersMeta.googleLinked}</strong></span>
            <span className="admin-chip">Yerel şifre: <strong>{usersMeta.withPassword}</strong></span>
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
              value={userFilterPremium}
              onChange={(e) => setUserFilterPremium(e.target.value)}
              aria-label="Premium filtresi"
            >
              <option value="">Tüm premium durumları</option>
              <option value="active">Şu an premium (süresi geçerli)</option>
              <option value="none">Premium yok / süresi dolmuş</option>
              <option value="aiplus">Manuel AI+ (aiPlus)</option>
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
              <option value="premiumUntil">Premium bitiş tarihi</option>
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
          <div className="admin-users-mobile">
            {usersList.map((u) => (
              <article
                key={`m-${String(u._id)}`}
                className={`admin-user-card ${u.isPremium ? "admin-user-card--premium" : ""}`}
              >
                <div className="admin-user-card__top">
                  <div className="admin-user-card__identity">
                    {u.avatar && (u.avatar.startsWith("http") || u.avatar.startsWith("data:")) ? (
                      <img src={u.avatar} alt="" className="admin-user-avatar admin-user-avatar--lg" />
                    ) : null}
                    <div>
                      <div className="admin-user-card__name">{u.username}</div>
                      <div className="admin-user-card__email">{u.email || "—"}</div>
                    </div>
                  </div>
                  <button type="button" className="admin-user-card__edit" onClick={() => openEdit(u)}>
                    Düzenle
                  </button>
                </div>
                <div className="admin-user-card__meta">
                  <span>
                    Premium:{" "}
                    {u.premiumUntil ? (
                      <strong className={u.isPremium ? "admin-text-ok" : "admin-text-warn"}>
                        {u.isPremium ? "Aktif" : "Dolmuş"}{" "}
                        ({new Date(u.premiumUntil).toLocaleDateString("tr-TR")})
                      </strong>
                    ) : (
                      "—"
                    )}
                  </span>
                  <span>
                    AI+:{" "}
                    <strong>{u.entitlements?.aiPlus ? "Evet" : "Hayır"}</strong>
                  </span>
                </div>
                <div className="admin-user-card__stats">
                  <span>Çalışılan {u.stats?.studied ?? 0}</span>
                  <span>Streak {u.streak ?? 0}</span>
                  <span>Kayıt {u.createdAt ? new Date(u.createdAt).toLocaleDateString("tr-TR") : "—"}</span>
                </div>
              </article>
            ))}
            {usersList.length === 0 && !usersLoading && (
              <p className="admin-user-card-empty">Kayıt yok veya filtrelere uymuyor.</p>
            )}
          </div>

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
                  <th>Premium</th>
                  <th>AI+</th>
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
                    <td className="admin-td-premium">
                      {u.premiumUntil ? (
                        <div className="admin-premium-cell">
                          <span
                            className={`admin-premium-badge ${u.isPremium ? "admin-premium-badge--on" : "admin-premium-badge--off"}`}
                          >
                            {u.isPremium ? "Aktif" : "Dolmuş"}
                          </span>
                          <span className="admin-premium-date">
                            {new Date(u.premiumUntil).toLocaleDateString("tr-TR")}
                          </span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {u.entitlements?.aiPlus ? (
                        <span className="admin-ai-badge" title="AI+ sınırsız mod">
                          AI+
                        </span>
                      ) : (
                        "—"
                      )}
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
                    <td colSpan={16}>Kayıt yok veya filtrelere uymuyor.</td>
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

            <div className="admin-modal-premium">
              <h4 className="admin-modal-subtitle">Premium &amp; AI+ kontrolü</h4>
              <p className="admin-premium-live">
                Kayıttaki durum:{" "}
                <strong className={editUser.isPremium ? "admin-text-ok" : undefined}>
                  Premium {editUser.isPremium ? "aktif" : "yok"}
                </strong>
                {" · "}
                <strong>{editUser.entitlements?.aiPlus ? "AI+ açık" : "AI+ kapalı"}</strong>
              </p>
              <p className="admin-small">
                <strong>Premium bitiş:</strong> reklamsız deneyim süresi. Boş bırakırsan premium kalkar. Paddle ile gelen
                abonelikler de burada tarih olarak görünür; manuel düzenleme dikkatli kullanılmalıdır.
              </p>
              <div className="admin-modal-grid">
                <label className="admin-modal-wide">
                  Premium geçerlilik bitişi
                  <input
                    type="datetime-local"
                    value={editForm.premiumUntilLocal}
                    onChange={(e) => setEditForm((f) => ({ ...f, premiumUntilLocal: e.target.value }))}
                  />
                </label>
                <label className="admin-modal-wide admin-modal-check">
                  <input
                    type="checkbox"
                    checked={editForm.aiPlus}
                    onChange={(e) => setEditForm((f) => ({ ...f, aiPlus: e.target.checked }))}
                  />
                  <span>AI yazım modu sınırı yok (manuel AI+)</span>
                </label>
              </div>
              <div className="admin-premium-quick">
                <button type="button" className="admin-modal-secondary" onClick={() => setPremiumEnd(30)}>
                  +30 gün
                </button>
                <button type="button" className="admin-modal-secondary" onClick={() => setPremiumEnd(365)}>
                  +1 yıl
                </button>
                <button type="button" className="admin-modal-secondary" onClick={setPremiumLifetime}>
                  Uzun süre (2099)
                </button>
                <button type="button" className="admin-modal-secondary" onClick={clearPremiumEnd}>
                  Premium tarihini sil
                </button>
              </div>
              <div className="admin-modal-actions admin-modal-actions--split">
                <button
                  type="button"
                  className="admin-modal-primary"
                  onClick={savePremium}
                  disabled={premiumSaving || editSaving}
                >
                  {premiumSaving ? "Kaydediliyor…" : "Premium / AI+ kaydet"}
                </button>
              </div>
            </div>

            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-secondary" onClick={closeEdit} disabled={editSaving}>
                Vazgeç
              </button>
              <button type="button" onClick={saveEdit} disabled={editSaving}>
                {editSaving ? "Kaydediliyor…" : "İstatistik kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAuthed && (
        <section className="admin-section admin-section--classrooms">
          <h3>Kurumsal sınıf yönetimi</h3>
          <p className="admin-small">
            Sınıf oluştur, <strong>sorumlu öğretmen ata</strong>, okul / şube / grup etiketleriyle düzenle. Öğrenciler yine sınıf kodu ile katılır;
            öğretmen Classroom ekranından yönetir.
          </p>

          <form className="admin-class-form" onSubmit={createClassroom}>
            <div className="admin-class-form__grid">
              <label>
                Sınıf adı *
                <input
                  className="admin-input-wide"
                  value={classForm.name}
                  onChange={(e) => setClassForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn: 12-D İleri İngilizce"
                  required
                />
              </label>
              <label>
                Sorumlu öğretmen / admin *
                <select
                  className="admin-select admin-select--fluid"
                  value={classForm.teacherId}
                  onChange={(e) => setClassForm((f) => ({ ...f, teacherId: e.target.value }))}
                  required
                >
                  <option value="">Seç…</option>
                  {teachersPick.map((t) => (
                    <option key={String(t._id)} value={String(t._id)}>
                      @{t.username} {t.nickname ? `(${t.nickname})` : ""} · {t.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Okul / kurum
                <input
                  className="admin-input-wide"
                  value={classForm.schoolName}
                  onChange={(e) => setClassForm((f) => ({ ...f, schoolName: e.target.value }))}
                  placeholder="Örn: Ankara Fen Lisesi"
                />
              </label>
              <label>
                Şube / seviye etiketi
                <input
                  className="admin-input-wide"
                  value={classForm.gradeLabel}
                  onChange={(e) => setClassForm((f) => ({ ...f, gradeLabel: e.target.value }))}
                  placeholder="Örn: 12-D · hazırlık"
                />
              </label>
              <label>
                Organizasyon grubu (filtreleme)
                <input
                  className="admin-input-wide"
                  value={classForm.orgGroup}
                  onChange={(e) => setClassForm((f) => ({ ...f, orgGroup: e.target.value }))}
                  placeholder="Örn: ANK-2025 · kampüs kodu"
                />
              </label>
              <label className="admin-class-form__full">
                Etiketler (virgülle)
                <input
                  className="admin-input-wide"
                  value={classForm.tagsText}
                  onChange={(e) => setClassForm((f) => ({ ...f, tagsText: e.target.value }))}
                  placeholder="ydt, akşam, yoğun"
                />
              </label>
              <label className="admin-class-form__full">
                Açıklama (öğretmene görünür alan — ileride uygulamada gösterilebilir)
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={classForm.description}
                  onChange={(e) => setClassForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Kısa sınıf tanımı"
                />
              </label>
              <label className="admin-class-form__full">
                Yönetici notu (yalnızca panel)
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={classForm.adminNote}
                  onChange={(e) => setClassForm((f) => ({ ...f, adminNote: e.target.value }))}
                  placeholder="Dahili not"
                />
              </label>
            </div>
            <button type="submit" disabled={classSaving}>
              {classSaving ? "Oluşturuluyor…" : "Sınıf oluştur ve kod üret"}
            </button>
          </form>

          <div className="admin-class-toolbar">
            <input
              className="admin-input-wide"
              placeholder="Sınıf adı, kod, okul veya grup ara…"
              value={classFilterQ}
              onChange={(e) => setClassFilterQ(e.target.value)}
            />
            <button type="button" onClick={() => loadClassrooms()} disabled={classroomsLoading}>
              {classroomsLoading ? "…" : "Listeyi yenile"}
            </button>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table admin-class-table">
              <thead>
                <tr>
                  <th>Sınıf</th>
                  <th>Kod</th>
                  <th>Öğretmen</th>
                  <th>Okul</th>
                  <th>Şube</th>
                  <th>Grup</th>
                  <th>Öğrenci</th>
                  <th>Güncelleme</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {classrooms.map((c) => (
                  <tr key={String(c._id)}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.tags?.length ? (
                        <div className="admin-class-tags">
                          {c.tags.map((tg) => (
                            <span key={tg} className="admin-mini-tag">
                              {tg}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="admin-td-mono">{c.code}</td>
                    <td>
                      {c.teacherId?.username ? `@${c.teacherId.username}` : "—"}
                      <div className="admin-small admin-class-sub">{c.teacherId?.email || ""}</div>
                    </td>
                    <td>{c.schoolName || "—"}</td>
                    <td>{c.gradeLabel || "—"}</td>
                    <td>{c.orgGroup || "—"}</td>
                    <td>{c.memberCount ?? 0}</td>
                    <td className="admin-td-nowrap">
                      {c.updatedAt ? new Date(c.updatedAt).toLocaleString("tr-TR") : "—"}
                    </td>
                    <td>
                      <button type="button" className="admin-table-btn" onClick={() => openEditClass(c)}>
                        Düzenle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {classrooms.length === 0 && !classroomsLoading && (
              <p className="admin-small">Henüz sınıf yok veya filtreye uyan kayıt yok.</p>
            )}
          </div>
        </section>
      )}

      {editClassroom && (
        <div className="admin-modal-overlay" onClick={() => !classSaving && setEditClassroom(null)}>
          <div className="admin-modal admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <h3>Sınıf düzenle</h3>
            <p className="admin-small">Kod: {editClassroom.code}</p>
            <div className="admin-class-form__grid">
              <label>
                Ad
                <input
                  className="admin-input-wide"
                  value={editClassForm.name}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Sorumlu
                <select
                  className="admin-select admin-select--fluid"
                  value={editClassForm.teacherId}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, teacherId: e.target.value }))}
                >
                  {teachersPick.map((t) => (
                    <option key={String(t._id)} value={String(t._id)}>
                      @{t.username} ({t.role})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Okul
                <input
                  className="admin-input-wide"
                  value={editClassForm.schoolName}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, schoolName: e.target.value }))}
                />
              </label>
              <label>
                Şube / seviye
                <input
                  className="admin-input-wide"
                  value={editClassForm.gradeLabel}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, gradeLabel: e.target.value }))}
                />
              </label>
              <label>
                Org. grubu
                <input
                  className="admin-input-wide"
                  value={editClassForm.orgGroup}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, orgGroup: e.target.value }))}
                />
              </label>
              <label className="admin-class-form__full">
                Etiketler
                <input
                  className="admin-input-wide"
                  value={editClassForm.tagsText}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, tagsText: e.target.value }))}
                />
              </label>
              <label className="admin-class-form__full">
                Açıklama
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={editClassForm.description}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>
              <label className="admin-class-form__full">
                Yönetici notu
                <textarea
                  className="admin-textarea"
                  rows={2}
                  value={editClassForm.adminNote}
                  onChange={(e) => setEditClassForm((f) => ({ ...f, adminNote: e.target.value }))}
                />
              </label>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-secondary" onClick={() => setEditClassroom(null)} disabled={classSaving}>
                Kapat
              </button>
              <button type="button" className="admin-modal-primary" onClick={saveEditClass} disabled={classSaving}>
                {classSaving ? "Kaydediliyor…" : "Kaydet"}
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

      {isAuthed && (
        <section className="admin-section">
          <h3>Kelime yönetimi</h3>
          <p className="admin-small">Kelimeleri ara, filtrele, düzenle veya sil.</p>

          <div className="admin-users-toolbar">
            <input
              className="admin-input-wide"
              placeholder="Kelime veya anlam ara…"
              value={wordQInput}
              onChange={(e) => setWordQInput(e.target.value)}
            />
            <select
              className="admin-select"
              value={wordLevelFilter}
              onChange={(e) => setWordLevelFilter(e.target.value)}
              aria-label="Seviye filtresi"
            >
              <option value="">Tüm seviyeler</option>
              {["A1", "A2", "B1", "B2", "C1", "C2"].map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
            <select
              className="admin-select"
              value={wordsLimit}
              onChange={(e) => setWordsLimit(Number(e.target.value))}
              aria-label="Sayfa başına"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} / sayfa
                </option>
              ))}
            </select>
            <button type="button" onClick={() => loadWords()} disabled={wordsLoading}>
              {wordsLoading ? "…" : "Yenile"}
            </button>
          </div>

          <p className="admin-small">
            Toplam {wordsTotal} kayıt · sayfa {wordsPage} / {wordsPages}
            {wordsLoading ? " · yükleniyor…" : ""}
          </p>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Meaning</th>
                  <th>Level</th>
                  <th>Güncellendi</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {wordsList.map((w) => (
                  <tr key={String(w._id)}>
                    <td><strong>{w.term}</strong></td>
                    <td>{w.meaning}</td>
                    <td className="admin-td-nowrap">{w.level || "—"}</td>
                    <td className="admin-td-nowrap">
                      {w.updatedAt ? new Date(w.updatedAt).toLocaleString("tr-TR") : "—"}
                    </td>
                    <td className="admin-td-nowrap">
                      <button type="button" onClick={() => openEditWord(w)}>Düzenle</button>{" "}
                      <button type="button" className="admin-logout-btn" onClick={() => deleteWord(w)}>Sil</button>
                    </td>
                  </tr>
                ))}
                {wordsList.length === 0 && !wordsLoading && (
                  <tr>
                    <td colSpan={5}>Kayıt yok veya filtreye uyan kelime bulunamadı.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-pagination">
            <button type="button" disabled={wordsPage <= 1 || wordsLoading} onClick={() => setWordsPage((p) => Math.max(1, p - 1))}>
              ← Önceki
            </button>
            <span>{wordsPage} / {wordsPages}</span>
            <button type="button" disabled={wordsPage >= wordsPages || wordsLoading} onClick={() => setWordsPage((p) => p + 1)}>
              Sonraki →
            </button>
          </div>
        </section>
      )}

      {isAuthed && editWord && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true">
          <div className="admin-modal admin-modal--wide">
            <div className="admin-modal-header">
              <h3>Kelime düzenle</h3>
              <button type="button" className="admin-modal-close" onClick={closeEditWord} aria-label="Kapat">
                ✕
              </button>
            </div>
            <div className="admin-modal-grid">
              <label>
                Term
                <input value={editWordForm.term} onChange={(e) => setEditWordForm((f) => ({ ...f, term: e.target.value }))} />
              </label>
              <label>
                Meaning
                <input value={editWordForm.meaning} onChange={(e) => setEditWordForm((f) => ({ ...f, meaning: e.target.value }))} />
              </label>
              <label className="admin-modal-wide">
                Hint
                <input value={editWordForm.hint} onChange={(e) => setEditWordForm((f) => ({ ...f, hint: e.target.value }))} />
              </label>
              <label className="admin-modal-wide">
                Example
                <input value={editWordForm.example} onChange={(e) => setEditWordForm((f) => ({ ...f, example: e.target.value }))} />
              </label>
              <label>
                Level
                <select value={editWordForm.level} onChange={(e) => setEditWordForm((f) => ({ ...f, level: e.target.value }))}>
                  {["A1", "A2", "B1", "B2", "C1", "C2"].map((lv) => (
                    <option key={lv} value={lv}>{lv}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-secondary" onClick={closeEditWord} disabled={editWordSaving}>
                Vazgeç
              </button>
              <button type="button" className="admin-modal-primary" onClick={saveEditWord} disabled={editWordSaving}>
                {editWordSaving ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
