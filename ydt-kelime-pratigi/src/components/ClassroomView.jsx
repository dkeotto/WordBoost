import React, { useEffect, useMemo, useState } from "react";

export default function ClassroomView({ user }) {
  const token = user?.token || "";
  const role = user?.role || "student";
  const isTeacher = role === "teacher" || role === "admin";
  const isStudent = role === "student";

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sınıflar yüklenemedi");
    setTeacherClasses(data.items || []);
    if (!selectedClassId && data.items?.[0]?._id) setSelectedClassId(String(data.items[0]._id));
  };

  const loadStudents = async (classId) => {
    if (!isTeacher || !token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/students`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Öğrenciler yüklenemedi");
    setClassStudents(data.items || []);
  };

  const loadAnalytics = async (classId) => {
    if (!isTeacher || !token || !classId) return;
    const res = await fetch(`/api/classes/${classId}/analytics?days=14`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analiz yüklenemedi");
    setAnalytics(data);
  };

  const loadMyClasses = async () => {
    if (!isStudent || !token) return;
    const res = await fetch("/api/classes/me", { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sınıflarım yüklenemedi");
    setMyClasses(data.items || []);
  };

  useEffect(() => {
    setErr("");
    setMsg("");
    setTeacherClasses([]);
    setMyClasses([]);
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

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    Promise.all([loadStudents(selectedClassId), loadAnalytics(selectedClassId)])
      .catch((e) => setErr(e.message || "Yükleme hatası"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId]);

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
      const data = await res.json();
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
      const data = await res.json();
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
      const data = await res.json();
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
              <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                {teacherClasses.map((c) => (
                  <option key={String(c._id)} value={String(c._id)}>
                    {c.name} (Kod: {c.code})
                  </option>
                ))}
              </select>
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
            <h3>Öğrenciler</h3>
            {selectedClassId && (
              <p className="dash-muted">
                Seçili sınıf:{" "}
                <strong>
                  {teacherClasses.find((c) => String(c._id) === String(selectedClassId))?.name || "—"}
                </strong>
              </p>
            )}
            {classStudents.length === 0 ? (
              <p className="dash-muted">Öğrenci yok veya henüz yüklenmedi.</p>
            ) : (
              <div className="classroom-table">
                <div className="classroom-row head">
                  <span>Öğrenci</span>
                  <span>Bildi</span>
                  <span>Bilmedi</span>
                  <span>Streak</span>
                </div>
                {classStudents.map((s) => (
                  <div key={String(s._id)} className="classroom-row">
                    <span className="classroom-user">
                      {s.avatar ? <img src={s.avatar} alt="" /> : null}
                      <span>{s.username}</span>
                    </span>
                    <span>{s.stats?.known ?? 0}</span>
                    <span>{s.stats?.unknown ?? 0}</span>
                    <span>{s.streak ?? 0}</span>
                  </div>
                ))}
              </div>
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

