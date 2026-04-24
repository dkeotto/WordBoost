import React, { useEffect, useMemo, useState } from "react";
import { readResponseJson } from "../utils/httpJson";

export default function ClassroomView({ user, setCurrentView, startCustomPractice }) {
  const token = user?.token || "";
  const role = user?.role || "student";
  const isTeacher = role === "teacher" || role === "admin";
  const isStudent = role === "student";

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDeleteClass = async (classId) => {
    if (!window.confirm("Bu sınıfı ve tüm verilerini silmek istediğine emin misin?")) return;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ""}/api/classes/${classId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Silinemedi");
      setTeacherClasses((prev) => prev.filter((c) => c._id !== classId));
      setErr("");
      setMsg("Sınıf başarıyla silindi");
    } catch (e) {
      setErr(e.message);
    }
  };

  // Teacher state
  const [className, setClassName] = useState("");
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classStudents, setClassStudents] = useState([]);
  const [csvText, setCsvText] = useState("");
  const [analytics, setAnalytics] = useState(null);

  // Student state
  const [joinCode, setJoinCode] = useState("");
  const [myClasses, setMyClasses] = useState([]);

  // Social & Leaderboard state
  const [announcements, setAnnouncements] = useState([]);
  const [newAnnouncement, setNewAnnouncement] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);

  // Activity & Analytics
  const [failedWords, setFailedWords] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);

  // Custom Decks
  const [customDecks, setCustomDecks] = useState([]);
  const [deckForm, setDeckForm] = useState({ name: "", terms: "" });

  // Assignment state
  const [assignments, setAssignments] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ title: "", taskType: "general_practice", targetCount: 50, rewardXp: 50, customDeckId: "", dueDate: "" });

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      Authorization: token,
    }),
    [token]
  );

  const loadTeacherClasses = async () => {
    if (!isTeacher || !token) return;
    const res = await fetch("/api/classes", { headers });
    const data = await readResponseJson(res);
    if (!res.ok) throw new Error(data.error || "Sınıflar yüklenemedi");
    setTeacherClasses(data.items || []);
    if (!selectedClassId && data.items?.[0]?._id) setSelectedClassId(String(data.items[0]._id));
  };

  const loadStudents = async (classId) => {
    if (!isTeacher || !token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/students`, { headers });
    const data = await readResponseJson(res);
    if (!res.ok) throw new Error(data.error || "Öğrenciler yüklenemedi");
    setClassStudents(data.items || []);
  };

  const loadAnalytics = async (classId) => {
    if (!isTeacher || !token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/analytics?days=14`, { headers });
    const data = await readResponseJson(res);
    if (!res.ok) throw new Error(data.error || "Analiz yüklenemedi");
    setAnalytics(data);
  };

  const loadMyClasses = async () => {
    if (!isStudent || !token) return;
    const res = await fetch("/api/classes/me", { headers });
    const data = await readResponseJson(res);
    if (!res.ok) throw new Error(data.error || "Sınıflarım yüklenemedi");
    setMyClasses(data.items || []);

    let allAssig = [];
    let allAnn = [];
    for (const cls of (data.items || [])) {
       try {
         const aRes = await fetch(`/api/classes/${cls.id}/assignments`, { headers });
         const aData = await readResponseJson(aRes);
         if (aRes.ok && aData.items) {
            allAssig = [...allAssig, ...aData.items.map(x => ({ ...x, className: cls.name }))];
         }
         
         const annRes = await fetch(`/api/classes/${cls.id}/announcements`, { headers });
         const annData = await readResponseJson(annRes);
         if (annRes.ok && annData.items) {
            allAnn = [...allAnn, ...annData.items.map(x => ({ ...x, className: cls.name }))];
         }
       } catch (err) { console.error(err); }
    }
    setAssignments(allAssig);
    setAnnouncements(allAnn.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
  };

  useEffect(() => {
    setErr("");
    setMsg("");
    setTeacherClasses([]);
    setMyClasses([]);
    setAssignments([]);
    setAnnouncements([]);
    setLeaderboard([]);
    setSelectedClassId("");
    setClassStudents([]);
    if (!token) return;
    setLoading(true);
    Promise.resolve()
      .then(async () => {
        if (isTeacher) await loadTeacherClasses();
        if (isStudent) await loadMyClasses();
      })
      .catch((e) => setErr(e.message || "Yükleme hatası"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, role]);

  const loadAssignments = async (classId) => {
    if (!token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/assignments`, { headers });
    const data = await readResponseJson(res);
    if (!res.ok) throw new Error(data.error || "Ödevler yüklenemedi");
    setAssignments(data.items || []);
  };

  const loadLeaderboard = async (classId) => {
    if (!token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/leaderboard`, { headers });
    const data = await readResponseJson(res);
    setLeaderboard(data.items || []);
  };

  const loadAnnouncements = async (classId) => {
    if (!token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/announcements`, { headers });
    const data = await readResponseJson(res);
    setAnnouncements(data.items || []);
  };

  const loadFailedWords = async (classId) => {
    if (!token || !classId || !isTeacher) return;
    const res = await fetch(`/api/classes/${classId}/analytics/failed-words`, { headers });
    const data = await readResponseJson(res);
    if (res.ok) setFailedWords(data.items || []);
  };

  const loadActivityFeed = async (classId) => {
    if (!token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/activity-feed`, { headers });
    const data = await readResponseJson(res);
    if (res.ok) setActivityFeed(data.items || []);
  };

  const loadCustomDecks = async (classId) => {
    if (!token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/custom-decks`, { headers });
    const data = await readResponseJson(res);
    if (res.ok) setCustomDecks(data.items || []);
  };

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    Promise.all([
      loadStudents(selectedClassId), 
      loadAnalytics(selectedClassId), 
      loadAssignments(selectedClassId),
      loadLeaderboard(selectedClassId),
      loadAnnouncements(selectedClassId),
      loadFailedWords(selectedClassId),
      loadActivityFeed(selectedClassId),
      loadCustomDecks(selectedClassId)
    ])
      .catch((e) => setErr(e.message || "Yükleme hatası"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

  const createAssignment = async () => {
    if (!selectedClassId) return;
    if (!assignmentForm.title || !assignmentForm.dueDate) {
      setErr("Başlık ve tarih zorunludur"); return;
    }
    setLoading(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/assignments`, {
        method: "POST", headers, body: JSON.stringify(assignmentForm),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Ödev oluşturulamadı");
      setMsg("Ödev başarıyla verildi!");
      setAssignmentForm({ title: "", taskType: "general_practice", targetCount: 50, rewardXp: 50, dueDate: "" });
      await loadAssignments(selectedClassId);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  
  const deleteAssignment = async (id) => {
    if (!window.confirm("Görevi silmek istediğine emin misin?")) return;
    setLoading(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/assignments/${id}`, { method: "DELETE", headers });
      if (!res.ok) throw new Error("Silinemedi");
      setMsg("Görev silindi.");
      await loadAssignments(selectedClassId);
    } catch (e) { setErr(e.message || "Hata"); }
    finally { setLoading(false); }
  };

  const createAnnouncement = async () => {
    if (!selectedClassId || !newAnnouncement.trim()) return;
    setLoading(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/announcements`, {
        method: "POST", headers, body: JSON.stringify({ content: newAnnouncement })
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Duyuru paylaşılamadı");
      setMsg("Duyuru başarıyla panoya asıldı!");
      setNewAnnouncement("");
      await loadAnnouncements(selectedClassId);
    } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };
  
  const deleteAnnouncement = async (id) => {
    if (!window.confirm("Duyuruyu silmek istediğine emin misin?")) return;
    setLoading(true); setErr(""); setMsg("");
    try {
       const res = await fetch(`/api/classes/${selectedClassId}/announcements/${id}`, { method: "DELETE", headers });
       if (!res.ok) throw new Error("Silinemedi");
       setMsg("Duyuru silindi.");
       await loadAnnouncements(selectedClassId);
    } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };

  const createCustomDeck = async () => {
    if (!selectedClassId || !deckForm.name || !deckForm.terms) return;
    setLoading(true); setErr(""); setMsg("");
    try {
      const termsArray = deckForm.terms.split(',').map(t => t.trim()).filter(Boolean);
      const res = await fetch(`/api/classes/${selectedClassId}/custom-decks`, {
        method: "POST", headers, body: JSON.stringify({ name: deckForm.name, terms: termsArray })
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Deste oluşturulamadı");
      setMsg("Deste başarıyla kaydedildi!");
      setDeckForm({ name: "", terms: "" });
      await loadCustomDecks(selectedClassId);
    } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };

  const deleteCustomDeck = async (id) => {
    if (!window.confirm("Bu desteyi silmek istediğinize emin misiniz?")) return;
    setLoading(true); setErr(""); setMsg("");
    try {
       const res = await fetch(`/api/classes/${selectedClassId}/custom-decks/${id}`, { method: "DELETE", headers });
       if (!res.ok) throw new Error("Silinemedi");
       setMsg("Deste silindi.");
       await loadCustomDecks(selectedClassId);
    } catch(e) { setErr(e.message); } finally { setLoading(false); }
  };

  const deleteClass = async () => {
    if (!selectedClassId) return;
    const cls = (teacherClasses || []).find(c => String(c._id) === String(selectedClassId));
    if (!window.confirm(`"${cls?.name}" sınıfını ve içindeki TÜM verileri (ödevler, üyelikler) silmek istediğine emin misin? Bu işlem geri alınamaz.`)) return;
    
    setLoading(true); setErr(""); setMsg("");
    try {
      const res = await fetch(`/api/classes/${selectedClassId}`, { method: "DELETE", headers });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Sınıf silinemedi");
      setMsg("Sınıf başarıyla silindi.");
      setSelectedClassId("");
      await loadTeacherClasses();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  const createClass = async () => {
    if (!className.trim()) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: className.trim() }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Sınıf oluşturulamadı");
      setMsg(`Sınıf oluşturuldu: ${data.classroom?.name} (Kod: ${data.classroom?.code})`);
      setClassName("");
      await loadTeacherClasses();
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  const importCsv = async () => {
    if (!selectedClassId) return;
    if (!csvText.trim()) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/import-csv`, {
        method: "POST",
        headers,
        body: JSON.stringify({ csv: csvText }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "CSV içe aktarma başarısız");
      const createdN = data.created?.length || 0;
      const existedN = data.existed?.length || 0;
      const failN = data.failures?.length || 0;
      setMsg(`CSV işlendi. Yeni: ${createdN}, Var olan: ${existedN}, Hata: ${failN}`);
      setCsvText("");
      await loadStudents(selectedClassId);
      await loadAnalytics(selectedClassId);
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  const joinClass = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/classes/join", {
        method: "POST",
        headers,
        body: JSON.stringify({ code }),
      });
      const data = await readResponseJson(res);
      if (!res.ok) throw new Error(data.error || "Katılım başarısız");
      setMsg(`Sınıfa katıldın: ${data.classroom?.name} (Kod: ${data.classroom?.code})`);
      setJoinCode("");
      await loadMyClasses();
    } catch (e) {
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="classroom-view">
        <h2>Classroom</h2>
        <div className="empty-state">Sınıf sistemini kullanmak için giriş yapman gerekiyor.</div>
      </div>
    );
  }

  return (
    <div className="classroom-view">
      <h2>Classroom</h2>
      <p className="dash-muted">
        Rol: <strong>{role}</strong>
      </p>

      {loading && <div className="empty-state">Yükleniyor…</div>}
      {err && <div className="ai-error">{err}</div>}
      {msg && <div className="admin-msg">{msg}</div>}

      {isTeacher && (
        <div className="classroom-grid">
          <div className="classroom-card">
            <h3>Öğretmen Paneli</h3>
            <label>
              Sınıf adı
              <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Örn: 11-A YDT" />
            </label>
            <button type="button" onClick={createClass} disabled={loading}>
              Sınıf oluştur
            </button>

            <h4 style={{ marginTop: 14 }}>Sınıflarım</h4>
            {teacherClasses.length === 0 ? (
              <p className="dash-muted">Henüz sınıf yok.</p>
            ) : (
              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} style={{ flex: 1 }}>
                  {teacherClasses.map((c) => (
                    <option key={String(c._id)} value={String(c._id)}>
                      {c.name} (Kod: {c.code})
                    </option>
                  ))}
                </select>
                <button type="button" onClick={deleteClass} style={{ padding: "8px 12px", background: "rgba(255,50,50,0.2)", border: "1px solid #ff3232", color: "#ff3232", fontSize: "0.85rem" }}>Sınıfı Sil</button>
              </div>
            )}

            {selectedClassId ? (
              <div style={{ marginTop: 12 }}>
                <h4>CSV ile öğrenci ekle</h4>
                <p className="dash-muted">Format: header opsiyonel. `email,username` veya sadece `email` satırları.</p>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder={"email,username\nali@example.com,ali11\nayse@example.com,"}
                  rows={6}
                />
                <button type="button" onClick={importCsv} disabled={loading || !csvText.trim()}>
                  CSV içe aktar
                </button>
              </div>
            ) : null}
          </div>

          <div className="classroom-card">
            <h3>📢 Duyuru Paneli</h3>
            {!selectedClassId ? <p className="dash-muted">Önce sınıf seçin.</p> : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "1rem" }}>
                  <textarea rows={3} value={newAnnouncement} onChange={e=>setNewAnnouncement(e.target.value)} placeholder="Sınıfa bir mesaj veya duyuru yazın..." style={{ width: "100%", padding: "10px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid #444", color: "#fff" }} />
                  <button type="button" onClick={createAnnouncement} disabled={loading || !newAnnouncement.trim()}>Duyuruyu Paylaş</button>
                </div>
                <h4 style={{ marginTop: "10px", marginBottom: "5px" }}>Geçmiş Duyurular</h4>
                {announcements.length === 0 ? <p className="dash-muted">Henüz duyuru yok.</p> : announcements.map(ann => (
                  <div key={String(ann._id)} style={{ borderLeft: "4px solid #1cb0f6", padding: "12px", marginBottom: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <strong style={{ color: "#1cb0f6" }}>Öğretmen Mesajı</strong>
                      <button onClick={()=>deleteAnnouncement(ann._id)} style={{ padding: "2px 6px", fontSize: "0.75rem", background: "rgba(255,50,50,0.2)" }}>Sil</button>
                    </div>
                    <p style={{ margin: "5px 0", fontSize: "0.95rem" }}>{ann.content}</p>
                    <span style={{ fontSize: "0.75rem", color: "#888" }}>{new Date(ann.createdAt).toLocaleString("tr-TR")}</span>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="classroom-card">
            <h3>Sınıf Liderlik Tablosu 🏆</h3>
            {!selectedClassId ? <p className="dash-muted">Önce sınıf seçin.</p> : leaderboard.length === 0 ? <p className="dash-muted">Sınıfta henüz öğrenci yok.</p> : (
              <div className="classroom-table" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "12px", overflow: "hidden", border: "1px solid #333" }}>
                <div className="classroom-row head" style={{ background: "#222" }}>
                  <span>Sıra</span>
                  <span>Öğrenci</span>
                  <span>Deneyim (XP)</span>
                  <span>Doğru</span>
                </div>
                {leaderboard.map((s, idx) => {
                  let rankIcon = `#${idx + 1}`;
                  let rankColor = "#888";
                  if (idx === 0) { rankIcon = "🥇"; rankColor = "#FFD700"; }
                  else if (idx === 1) { rankIcon = "🥈"; rankColor = "#C0C0C0"; }
                  else if (idx === 2) { rankIcon = "🥉"; rankColor = "#CD7F32"; }

                  return (
                    <div key={String(s._id)} className="classroom-row" style={{ borderBottom: "1px solid #333" }}>
                      <span style={{ fontWeight: idx < 3 ? "bold" : "normal", fontSize: idx < 3 ? "1.2rem" : "1rem", color: rankColor }}>
                        {rankIcon}
                      </span>
                      <span className="classroom-user" style={{ fontWeight: idx === 0 ? "bold" : "normal" }}>
                        {s.avatar ? <img src={s.avatar} alt="avatar" style={{ border: `2px solid ${rankColor}` }} /> : null}
                        <span>{s.username}</span>
                      </span>
                      <span style={{ color: "#1cb0f6", fontWeight: "bold" }}>{s.stats?.xp || 0} XP</span>
                      <span style={{ color: "#58cc02" }}>{s.stats?.known || 0} Çözüldü</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="classroom-card" style={{ background: "linear-gradient(135deg, #FF6B6B 0%, #C83232 100%)", color: "white", padding: "20px", borderRadius: "16px", boxShadow: "0 8px 16px rgba(200, 50, 50, 0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gridColumn: "1 / -1" }}>
            <h3 style={{ margin: "0 0 10px 0", fontSize: "1.5rem" }}>🎮 Canlı Sınıf Yarışması (Kahoot Modu)</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "0.95rem", opacity: 0.9 }}>Öğrencilerinizle akıllı tahtadan eş zamanlı, yüksek çözünürlüklü canlı kelime savaşı başlatın!</p>
            <button onClick={() => setCurrentView('room-menu')} style={{ background: "white", color: "#C83232", padding: "12px 24px", fontSize: "1.1rem", borderRadius: "30px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" }}>🚀 Savaş Odanızı Kurun</button>
          </div>

          <div className="classroom-card">
            <h3>Ödev / Görev Yönetimi</h3>
            {!selectedClassId ? <p className="dash-muted">Önce sınıf seçin.</p> : (
              <>
                <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label>Başlık <input value={assignmentForm.title} onChange={e=>setAssignmentForm(f=>({...f, title: e.target.value}))} placeholder="Örn: Hafta Sonu Testi" /></label>
                  <label>Görev Türü
                    <select className="admin-select" value={assignmentForm.taskType} onChange={e=>setAssignmentForm(f=>({...f, taskType: e.target.value}))}>
                      <option value="general_practice">Genel Pratik Çözme</option>
                      <option value="speaking_practice">Speaking Pratiği</option>
                    </select>
                  </label>
                  <label>Özel Deste Sınırı (Opsiyonel)
                    <select className="admin-select" value={assignmentForm.customDeckId} onChange={e=>setAssignmentForm(f=>({...f, customDeckId: e.target.value}))}>
                      <option value="">-- Tüm Havuzu Kullan --</option>
                      {customDecks.map(d => <option key={String(d._id)} value={String(d._id)}>{d.name} ({d.terms?.length} kelime)</option>)}
                    </select>
                  </label>
                  <label>Hedef Soru/Kelime Sayısı <input type="number" value={assignmentForm.targetCount} onChange={e=>setAssignmentForm(f=>({...f, targetCount: Number(e.target.value)}))} /></label>
                  <label>Görev Ödülü (XP) <input type="number" value={assignmentForm.rewardXp} onChange={e=>setAssignmentForm(f=>({...f, rewardXp: Number(e.target.value)}))} /></label>
                  <label>Son Teslim <input type="datetime-local" value={assignmentForm.dueDate} onChange={e=>setAssignmentForm(f=>({...f, dueDate: e.target.value}))} /></label>
                  <button type="button" onClick={createAssignment} disabled={loading} style={{ marginTop: "5px" }}>Görev Ver</button>
                </div>
                
                <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Verilen Görevler</h4>
                {assignments.length === 0 ? <p className="dash-muted">Aktif görev yok.</p> : assignments.map(a => (
                  <div key={String(a._id)} style={{ border: "1px solid #444", padding: "12px", marginBottom: "12px", borderRadius: "8px", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: "1.1rem" }}>{a.title}</strong>
                      <button onClick={()=>deleteAssignment(a._id)} style={{ padding: "4px 8px", fontSize: "0.8rem", background: "rgba(255,50,50,0.2)" }}>İptal Et</button>
                    </div>
                    <p className="dash-muted" style={{ margin: "5px 0" }}>{a.taskType === "general_practice" ? "Soru Çözme" : "Speaking Pratiği"} - Hedef: {a.targetCount}</p>
                    <p style={{ color: "#FFD700", fontWeight: "bold", fontSize: "0.9rem", margin: "2px 0 5px 0" }}>Ödül: {a.rewardXp || 50} XP ⚡</p>
                    <p className="dash-muted">Teslim: {new Date(a.dueDate).toLocaleString("tr-TR")}</p>
                    
                    <div style={{ marginTop: "12px" }}>
                      <div className="classroom-row head"><span>Öğrenci</span><span>İlerleme durumu</span></div>
                      {(a.progressList || []).map(p => (
                        <div key={String(p._id)} className="classroom-row">
                          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {p.studentId?.avatar ? <img src={p.studentId.avatar} alt="a" style={{ width: 24, height: 24, borderRadius: "50%" }} /> : null}
                            {p.studentId?.username}
                          </span>
                          <span style={{ color: p.isCompleted ? "#58cc02" : "#ccc", fontWeight: "bold" }}>
                            {p.progress} / {a.targetCount} {p.isCompleted ? " (Bitti) ✅" : ""}
                          </span>
                        </div>
                      ))}
                      {(!a.progressList || a.progressList.length === 0) && <p className="dash-muted" style={{ fontSize: "0.85rem", padding: "4px 0" }}>Henüz ilerleme kaydeden yok.</p>}
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: "2rem", padding: "16px", borderRadius: "12px", border: "1px dashed #666", background: "rgba(0,0,0,0.2)" }}>
                  <h4>🃏 Yeni Özel Kelime Destesi Oluştur</h4>
                  <p className="dash-muted" style={{ fontSize: "0.85rem", marginBottom: "10px" }}>Öğrencilerinize sadece kendi seçtiğiniz kelimeleri ödev vermek için buradan liste hazırlayın (Virgülle ayırın, Örn: abandon, yield, tedious).</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input value={deckForm.name} onChange={e=>setDeckForm(f=>({...f, name: e.target.value}))} placeholder="Deste Adı (örn: Hafta Sonu Denemesi)" />
                    <textarea value={deckForm.terms} onChange={e=>setDeckForm(f=>({...f, terms: e.target.value}))} placeholder="abandon, submit, alter, modify..." rows={3}></textarea>
                    <button type="button" onClick={createCustomDeck} disabled={loading || !deckForm.name || !deckForm.terms} style={{ background: "#a855f7" }}>Desteyi Kaydet</button>
                  </div>
                  {customDecks.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <h5 style={{ margin: "5px 0" }}>Hocanın Desteleri</h5>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        {customDecks.map(d => (
                           <div key={String(d._id)} style={{ padding: "6px 12px", background: "rgba(168,85,247,0.2)", borderRadius: "20px", display: "flex", gap: "8px", alignItems: "center", fontSize: "0.85rem" }}>
                             <span>{d.name} ({d.terms?.length} ke.)</span>
                             <button onClick={()=>deleteCustomDeck(d._id)} style={{ padding: "2px 5px", background: "red", border: "none", borderRadius: "50%", color: "white", cursor: "pointer" }}>x</button>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="classroom-card">
            <h3>Aktivite / Progress</h3>
            {!analytics ? (
              <p className="dash-muted">Analiz yok.</p>
            ) : (
              <>
                <p className="dash-muted">
                  Son {analytics.daily?.length || 0} gün: toplam deneme{" "}
                  <strong>{(analytics.daily || []).reduce((a, x) => a + (x.attempts || 0), 0)}</strong>
                </p>
                <div className="classroom-table">
                  <div className="classroom-row head">
                    <span>Gün</span>
                    <span>Aktif</span>
                    <span>Deneme</span>
                    <span>Bildi</span>
                    <span>Bilmedi</span>
                  </div>
                  {(analytics.daily || []).slice(-14).map((d) => (
                    <div key={d.day} className="classroom-row">
                      <span>{d.day}</span>
                      <span>{d.active ?? 0}</span>
                      <span>{d.attempts ?? 0}</span>
                      <span>{d.known ?? 0}</span>
                      <span>{d.unknown ?? 0}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="classroom-card">
            <h3>📊 Sınıf Zorlanma Analizi (Zayıf Halka)</h3>
            {!selectedClassId ? <p className="dash-muted">Önce sınıf seçin.</p> : failedWords.length === 0 ? <p className="dash-muted">Yeterli veri yok.</p> : (
              <div className="classroom-table" style={{ background: "rgba(0,0,0,0.2)", borderRadius: "12px", overflow: "hidden" }}>
                <div className="classroom-row head" style={{ background: "#c83232", color: "white" }}>
                  <span>Kelime</span>
                  <span>Toplam Hata Sayısı</span>
                </div>
                {failedWords.map((fw, idx) => (
                  <div key={fw._id} className="classroom-row" style={{ borderBottom: "1px solid #333" }}>
                    <strong style={{ color: idx < 3 ? "#ff6b6b" : "#fff", fontSize: "1.1rem" }}>{fw._id}</strong>
                    <span>{fw.totalUnknown} Kere bilemediler</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="classroom-card">
            <h3>⚡ Sınıf İçi Anlık Akış (Activity Feed)</h3>
            {!selectedClassId ? <p className="dash-muted">Önce sınıf seçin.</p> : activityFeed.length === 0 ? <p className="dash-muted">Henüz aktivite yok.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "400px", overflowY: "auto", paddingRight: "5px" }}>
                {activityFeed.map(log => {
                   let icon = "🟢";
                   if (log.type === "assignment_complete") icon = "🎯";
                   else if (log.type === "streak") icon = "🔥";
                   else if (log.type === "leader_board") icon = "🏆";
                   else if (log.type === "announcement") icon = "📢";

                   return (
                     <div key={String(log._id)} style={{ display: "flex", gap: "10px", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", borderLeft: `3px solid ${icon === "🎯" ? "#58cc02" : "#1cb0f6"}` }}>
                        <div style={{ fontSize: "1.5rem" }}>{icon}</div>
                        <div>
                          <strong style={{ fontSize: "0.95rem" }}>{log.studentId ? log.studentId.username : "Öğretmen"}</strong>
                          <p style={{ margin: "2px 0 0 0", fontSize: "0.9rem", color: "#ccc" }}>{log.content}</p>
                          <span style={{ fontSize: "0.7rem", color: "#888" }}>{new Date(log.createdAt).toLocaleTimeString("tr-TR")}</span>
                        </div>
                     </div>
                   );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {isStudent && (
        <div className="classroom-grid">
          <div className="classroom-card">
            <h3>Öğrenci Paneli</h3>
            <label>
              Sınıf kodu
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Örn: A1B2C3" />
            </label>
            <button type="button" onClick={joinClass} disabled={loading}>
              Sınıfa katıl
            </button>
          </div>

          <div className="classroom-card">
            <h3>📢 Sınıf Duyuruları</h3>
            {announcements.length === 0 ? (
              <p className="dash-muted">Şu an için sınıfında yapılmış bir duyuru yok.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "1rem" }}>
                {announcements.map(ann => (
                  <div key={String(ann._id)} style={{ borderLeft: "4px solid #1cb0f6", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", boxShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong style={{ color: "#1cb0f6", fontSize: "0.95rem" }}>{ann.className} - {ann.teacherId?.username}</strong>
                      <span style={{ fontSize: "0.75rem", color: "#888" }}>{new Date(ann.createdAt).toLocaleDateString("tr-TR")}</span>
                    </div>
                    <p style={{ margin: "0", fontSize: "1rem", lineHeight: "1.4" }}>{ann.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="classroom-card" style={{ background: "linear-gradient(135deg, #1CB0F6 0%, #1480B5 100%)", color: "white", padding: "20px", borderRadius: "16px", boxShadow: "0 8px 16px rgba(28, 176, 246, 0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gridColumn: "1 / -1" }}>
             <h3 style={{ margin: "0 0 10px 0", fontSize: "1.5rem" }}>🎮 Sınıf Savaşlarına Katıl!</h3>
             <p style={{ margin: "0 0 20px 0", fontSize: "0.95rem", opacity: 0.9 }}>Öğretmeninin başlattığı odaya girip şampiyonluğunu kanıtla!</p>
             <button onClick={() => setCurrentView('room-menu')} style={{ background: "white", color: "#1480B5", padding: "12px 24px", fontSize: "1.1rem", borderRadius: "30px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.2)" }}>🚀 Savaş Arenasına Bağlan</button>
          </div>

          <div className="classroom-card">
            <h3>Aktif Görevlerim</h3>
            {assignments.filter(a => new Date(a.dueDate) > new Date()).length === 0 ? (
              <p className="dash-muted">Harika! Şu an bekleyen bir ödevin yok.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px", marginTop: "1rem" }}>
                {assignments.filter(a => new Date(a.dueDate) > new Date()).map(a => {
                  const prog = a.progress?.progress || 0;
                  const pct = Math.min(100, Math.round((prog / a.targetCount) * 100));
                  return (
                    <div key={String(a._id)} style={{ border: "2px solid #333", padding: "16px", borderRadius: "16px", background: "var(--bg-card)", boxShadow: "0 4px 6px rgba(0,0,0,0.3)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <strong style={{ fontSize: "1.1rem", color: "#fff" }}>{a.title}</strong>
                        <span style={{ fontSize: "0.85rem", color: "#888", display: "flex", alignItems: "center" }}>{a.className}</span>
                      </div>
                      <p className="dash-muted" style={{ margin: "0 0 5px 0", fontSize: "0.9rem" }}>
                        {a.taskType === "general_practice" ? "🎯 Çoktan Seçmeli Kelime Çöz" : "🎙️ Telaffuz Macerası"} — Bitiş: {new Date(a.dueDate).toLocaleDateString("tr-TR")}
                      </p>
                      <p style={{ color: "#FFD700", fontWeight: "bold", fontSize: "0.95rem", margin: "0 0 16px 0" }}>
                        Ödül: {a.rewardXp || 50} Deneyim Puanı (XP) ⚡
                      </p>
                      
                      <div style={{ position: "relative", height: "26px", background: "#222", borderRadius: "13px", overflow: "hidden", border: "1px solid #444" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pct}%`, background: a.progress?.isCompleted ? "#58cc02" : "linear-gradient(90deg, #1cb0f6, #1480b5)", transition: "width 0.5s ease" }} />
                        <span style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: "0.85rem", lineHeight: "26px", fontWeight: "bold", textShadow: "0px 1px 3px rgba(0,0,0,0.8)" }}>
                          {prog} / {a.targetCount}
                        </span>
                      </div>
                      {a.progress?.isCompleted && (
                        <p style={{ marginTop: "10px", color: "#58cc02", fontWeight: "bold", fontSize: "0.95rem", textAlign: "center", marginBottom: 0 }}>
                          TEBRİKLER! Görevi tamamladın! 🎉
                        </p>
                      )}
                      
                      {!a.progress?.isCompleted && (
                        <button 
                          onClick={() => {
                            if (a.taskType === 'speaking_practice') {
                              setCurrentView('speaking');
                            } else {
                              if (a.customDeckId) {
                                // Try to find the deck terms if we have them loaded
                                const deck = (customDecks || []).find(d => d._id === a.customDeckId);
                                if (deck && deck.terms) {
                                  startCustomPractice(deck.terms);
                                } else {
                                  // As fallback if not loaded, just regular practice for now
                                  setCurrentView('practice');
                                }
                              } else {
                                setCurrentView('practice');
                              }
                            }
                          }}
                          style={{ marginTop: "15px", width: "100%", background: "#58cc02", color: "white", fontWeight: "bold", border: "none", padding: "10px", borderRadius: "10px", cursor: "pointer" }}
                        >
                          🚀 Göreve Başla!
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="classroom-card">
            <h3>Sınıflarım</h3>
            {myClasses.length === 0 ? (
              <p className="dash-muted">Henüz bir sınıfa bağlı değilsin.</p>
            ) : (
              <ul className="dash-list">
                {myClasses.map((c) => (
                  <li key={String(c.id)}>
                    <span className="dash-term">{c.name}</span>
                    <span className="dash-chip">{c.code}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!isTeacher && !isStudent && (
        <div className="empty-state">Bu rol için Classroom ekranı tanımlı değil.</div>
      )}
    </div>
  );
}

