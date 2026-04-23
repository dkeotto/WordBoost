import React, { useMemo, useState, useEffect } from "react";
import AdSlot from "./AdSlot";
import { getConsentStatus, openConsentDialog } from "../utils/consentStorage";

// ── helpers ────────────────────────────────────────────────────────────────
const DAYS_TR   = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
const MONTHS_TR = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
const CEFR_LEVELS = ["A1","A2","B1","B2","C1","C2"];

const CEFR_COLORS = {
  A1: "#4ecdc4", A2: "#45b7d1",
  B1: "#96ceb4", B2: "#ffeaa7",
  C1: "#fd79a8", C2: "#a29bfe",
};

const XP_LEVELS = [
  { min: 0,    label: "Çaylak",   icon: "🌱", color: "#78e08f" },
  { min: 300,  label: "Öğrenci",  icon: "📚", color: "#74b9ff" },
  { min: 800,  label: "Kaşif",    icon: "🔍", color: "#a29bfe" },
  { min: 1800, label: "Usta",     icon: "⭐", color: "#fdcb6e" },
  { min: 4000, label: "Uzman",    icon: "🏆", color: "#e17055" },
  { min: 8000, label: "Efsane",   icon: "🔥", color: "#ff7675" },
];

function getXpInfo(xp) {
  let lvl = XP_LEVELS[0];
  for (const l of XP_LEVELS) { if (xp >= l.min) lvl = l; else break; }
  const idx    = XP_LEVELS.indexOf(lvl);
  const next   = XP_LEVELS[idx + 1];
  const pct    = next ? Math.round(((xp - lvl.min) / (next.min - lvl.min)) * 100) : 100;
  return { ...lvl, pct, nextMin: next?.min ?? null, idx };
}

const formatDayKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ── DashboardView ──────────────────────────────────────────────────────────
const DashboardView = ({ stats, practiceHistory, wrongWords, moduleStats, user }) => {
  const [consentStatus, setConsentStatus] = useState(() => getConsentStatus().status);
  const [dailyGoal, setDailyGoal] = useState(() =>
    parseInt(localStorage.getItem("wb_daily_goal") || "20", 10)
  );
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(dailyGoal);

  useEffect(() => {
    const onChange = () => setConsentStatus(getConsentStatus().status);
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  const nowMs     = Date.now();
  const isPremium = Boolean(
    user?.isPremium || (user?.premiumUntil && new Date(user.premiumUntil).getTime() > nowMs)
  );
  const adsClient  = import.meta.env.VITE_ADSENSE_CLIENT;
  const slotSide   = import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_SIDEBAR;
  const slotInline = import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_INLINE;
  const adsOk      = Boolean(adsClient && slotSide && slotInline);
  const adsMissing = useMemo(() => {
    const k = [];
    if (!adsClient)  k.push("VITE_ADSENSE_CLIENT");
    if (!slotSide)   k.push("VITE_ADSENSE_SLOT_DASHBOARD_SIDEBAR");
    if (!slotInline) k.push("VITE_ADSENSE_SLOT_DASHBOARD_INLINE");
    return k;
  }, [adsClient, slotSide, slotInline]);
  const showAdsHint = !isPremium && adsOk && consentStatus !== "accepted";

  // ── Module stats ──────────────────────────────────────────────────────────
  const syn = moduleStats?.synonyms || { attempted:0, correct:0, wrong:0, bestStreak:0 };
  const phr = moduleStats?.phrasal  || { attempted:0, correct:0, wrong:0, bestStreak:0 };
  const spk = moduleStats?.speaking || { attempted:0, correct:0, wrong:0, bestStreak:0 };
  const synRate = syn.attempted ? Math.round((syn.correct / syn.attempted) * 100) : 0;
  const phrRate = phr.attempted ? Math.round((phr.correct / phr.attempted) * 100) : 0;
  const spkRate = spk.attempted ? Math.round((spk.correct / spk.attempted) * 100) : 0;

  // ── XP ───────────────────────────────────────────────────────────────────
  const xp = useMemo(() =>
    (stats.known || 0) * 10
    + (syn.correct) * 15
    + (phr.correct) * 20
    + (spk.correct) * 25,
    [stats.known, syn.correct, phr.correct, spk.correct]
  );
  const xpInfo = useMemo(() => getXpInfo(xp), [xp]);

  // ── Weekly chart ─────────────────────────────────────────────────────────
  const last7Days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      return { key: formatDayKey(d), label: DAYS_TR[d.getDay()], studied: 0, known: 0 };
    });
  }, []);

  const chartData = useMemo(() => {
    const map = new Map(last7Days.map((d) => [d.key, { ...d }]));
    practiceHistory.forEach((item) => {
      if (!item?.date) return;
      const d = new Date(item.date);
      if (isNaN(d.getTime())) return;
      const entry = map.get(formatDayKey(d));
      if (!entry) return;
      entry.studied++;
      if (item.isKnown) entry.known++;
    });
    return Array.from(map.values());
  }, [last7Days, practiceHistory]);

  const weeklyStudied = chartData.reduce((a, d) => a + d.studied, 0);
  const weeklyKnown   = chartData.reduce((a, d) => a + d.known,   0);
  const successRate   = weeklyStudied ? Math.round((weeklyKnown / weeklyStudied) * 100) : 0;
  const maxBar        = Math.max(...chartData.map((d) => d.studied), 1);
  const todayStudied  = chartData[6]?.studied || 0;
  const dailyPct      = Math.min(100, Math.round((todayStudied / dailyGoal) * 100));

  // ── Streak ───────────────────────────────────────────────────────────────
  const { currentStreak, bestStreak } = useMemo(() => {
    const daySet = new Set();
    practiceHistory.forEach((item) => {
      if (!item?.date) return;
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) daySet.add(formatDayKey(d));
    });
    const countBack = (from) => {
      let c = 0, d = new Date(from);
      while (daySet.has(formatDayKey(d))) { c++; d.setDate(d.getDate() - 1); }
      return c;
    };
    const today = new Date();
    const yest  = new Date(); yest.setDate(today.getDate() - 1);
    const current = daySet.has(formatDayKey(today)) ? countBack(today) : countBack(yest);
    // Best streak
    const sorted = [...daySet].sort();
    let best = 0, cur = 0, prevMs = null;
    for (const key of sorted) {
      const ms = new Date(key + "T00:00:00").getTime();
      if (prevMs !== null && ms - prevMs === 86400000) cur++;
      else { best = Math.max(best, cur); cur = 1; }
      prevMs = ms;
    }
    return { currentStreak: current, bestStreak: Math.max(best, cur, current) };
  }, [practiceHistory]);

  // ── Heatmap (last 91 days) ────────────────────────────────────────────────
  const heatmap = useMemo(() => {
    const cmap = {};
    practiceHistory.forEach((item) => {
      if (!item?.date) return;
      const d = new Date(item.date);
      if (isNaN(d.getTime())) return;
      const k = formatDayKey(d);
      cmap[k] = (cmap[k] || 0) + 1;
    });
    const now = new Date();
    return Array.from({ length: 91 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (90 - i));
      const k = formatDayKey(d);
      return { key: k, count: cmap[k] || 0, date: new Date(d), month: d.getMonth() };
    });
  }, [practiceHistory]);

  const heatMax = Math.max(...heatmap.map((d) => d.count), 1);
  const heatColor = (c) => {
    if (!c) return "rgba(255,255,255,0.05)";
    const v = Math.min(c / Math.max(heatMax, 5), 1);
    return `rgba(255,179,0,${0.18 + v * 0.82})`;
  };

  // ── CEFR breakdown ────────────────────────────────────────────────────────
  const cefrData = useMemo(() => {
    const counts = { A1:0, A2:0, B1:0, B2:0, C1:0, C2:0 };
    practiceHistory.forEach((item) => {
      if (!item?.isKnown || !counts.hasOwnProperty(item.level)) return;
      counts[item.level]++;
    });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return CEFR_LEVELS.map((lv) => ({
      level: lv, count: counts[lv],
      pct: Math.round((counts[lv] / total) * 100),
      color: CEFR_COLORS[lv],
    }));
  }, [practiceHistory]);

  // ── Misc ──────────────────────────────────────────────────────────────────
  const activeDays = useMemo(() => {
    const s = new Set();
    practiceHistory.forEach((item) => {
      if (!item?.date) return;
      const d = new Date(item.date);
      if (!isNaN(d.getTime())) s.add(formatDayKey(d));
    });
    return s.size;
  }, [practiceHistory]);

  const hardestWords = useMemo(() => {
    const m = new Map();
    practiceHistory.forEach((item) => {
      if (!item || item.isKnown || !item.term) return;
      const e = m.get(item.term) || { term: item.term, level: item.level || "?", count: 0 };
      e.count++;
      m.set(item.term, e);
    });
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  }, [practiceHistory]);

  const recentWords = useMemo(() =>
    [...practiceHistory].slice(-5).reverse().map((i) => i.term).filter(Boolean),
    [practiceHistory]
  );

  const totalModuleQ = syn.attempted + phr.attempted + spk.attempted;

  // Donut
  const activeRates = [successRate, synRate, phrRate, spkRate].filter(
    (_, i) => i === 0 || [syn, phr, spk][i - 1].attempted > 0
  );
  const donutRate = activeRates.length
    ? Math.round(activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
  const donutGrad = `conic-gradient(#ffb300 0% ${donutRate}%, rgba(255,255,255,0.08) ${donutRate}% 100%)`;

  // Save daily goal
  const saveGoal = () => {
    const v = Math.max(5, Math.min(200, Number(goalInput) || 20));
    setDailyGoal(v);
    localStorage.setItem("wb_daily_goal", String(v));
    setEditingGoal(false);
  };

  // Heatmap month labels (show label at first cell of each month)
  const heatMonthLabels = useMemo(() => {
    const labels = [];
    let last = -1;
    heatmap.forEach((d, i) => {
      if (d.month !== last) { labels[i] = MONTHS_TR[d.month]; last = d.month; }
      else labels[i] = null;
    });
    return labels;
  }, [heatmap]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="dashboard-view">
      {/* Dev ads notice */}
      {!isPremium && !adsOk && import.meta.env.PROD && (
        <p className="dash-ads-dev-hint">
          Reklamlar için <code>VITE_*</code> değişkenleri eksik:{" "}
          {adsMissing.map((k, i) => (
            <React.Fragment key={k}>{i > 0 ? ", " : null}<code>{k}</code></React.Fragment>
          ))}
        </p>
      )}
      {showAdsHint && (
        <div className="dash-ads-consent-hint" role="status">
          <span>Kişiselleştirilmiş reklamlar için çerezleri kabul etmen gerekiyor.</span>
          <button type="button" className="dash-ads-consent-btn" onClick={() => openConsentDialog()}>
            Çerez tercihini aç
          </button>
        </div>
      )}

      <div className="dash-page-header">
        <div>
          <h2 className="dash-title">İlerleme Takip Paneli</h2>
          <p className="dash-subtitle">Tüm gelişimin tek bakışta</p>
        </div>
        <div className="dash-level-badge" style={{ borderColor: xpInfo.color + "55", color: xpInfo.color }}>
          {xpInfo.icon} {xpInfo.label}
        </div>
      </div>

      <div className="dashboard-layout">
        <div className="dashboard-main">

          {/* ── Hero Row ─────────────────────────────────────────────── */}
          <div className="dash-hero-row">
            {/* Streak */}
            <div className="dash-hero-card dash-streak-card">
              <div className="dash-streak-flame">{currentStreak > 0 ? "🔥" : "💧"}</div>
              <div className="dash-streak-num">{currentStreak}</div>
              <div className="dash-streak-lbl">günlük seri</div>
              <div className="dash-streak-sub">En iyi: {bestStreak} gün</div>
            </div>

            {/* XP */}
            <div className="dash-hero-card dash-xp-card" style={{ "--xp-color": xpInfo.color }}>
              <div className="dash-xp-row">
                <span className="dash-xp-icon">{xpInfo.icon}</span>
                <div className="dash-xp-info">
                  <span className="dash-xp-name">{xpInfo.label}</span>
                  <span className="dash-xp-pts">{xp.toLocaleString("tr-TR")} XP</span>
                </div>
              </div>
              <div className="dash-xp-bar-track">
                <div className="dash-xp-bar-fill" style={{ width: `${xpInfo.pct}%`, background: xpInfo.color }} />
              </div>
              {xpInfo.nextMin && (
                <span className="dash-xp-next">Sonraki seviye: {xpInfo.nextMin.toLocaleString("tr-TR")} XP</span>
              )}
            </div>

            {/* Daily Goal */}
            <div className="dash-hero-card dash-goal-card">
              <div className="dash-goal-svg-wrap">
                <svg viewBox="0 0 36 36" className="dash-goal-svg">
                  <path className="dash-goal-bg"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2.8" />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#ffb300" strokeWidth="2.8"
                    strokeDasharray={`${dailyPct}, 100`} strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.6s ease" }} />
                  <text x="18" y="21" textAnchor="middle" fontSize="7.5" fill="#fff" fontWeight="800">
                    {dailyPct}%
                  </text>
                </svg>
              </div>
              <div className="dash-goal-right">
                <span className="dash-goal-label">Günlük Hedef</span>
                <span className="dash-goal-prog">{todayStudied} / {dailyGoal} soru</span>
                {!editingGoal ? (
                  <button className="dash-goal-edit" onClick={() => { setGoalInput(dailyGoal); setEditingGoal(true); }}>
                    ✎ Hedef Değiştir
                  </button>
                ) : (
                  <div className="dash-goal-edit-row">
                    <input
                      type="number" className="dash-goal-input" value={goalInput} min={5} max={200}
                      onChange={(e) => setGoalInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveGoal()}
                      autoFocus
                    />
                    <button className="dash-goal-save" onClick={saveGoal} aria-label="Kaydet">✓</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Summary Cards ─────────────────────────────────────────── */}
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <span>Toplam Öğrenilen</span>
              <strong>{stats.known}</strong>
            </div>
            <div className="dashboard-card">
              <span>Bu Hafta</span>
              <strong>{weeklyStudied}</strong>
            </div>
            <div className="dashboard-card">
              <span>Haftalık Başarı</span>
              <strong>%{successRate}</strong>
            </div>
            <div className="dashboard-card">
              <span>Aktif Gün</span>
              <strong>{activeDays}</strong>
            </div>
          </div>

          {/* ── Activity Heatmap ──────────────────────────────────────── */}
          <div className="dash-heatmap-box">
            <div className="dash-section-header">
              <h3>Aktivite Haritası</h3>
              <span className="dash-section-sub">Son 91 gün</span>
            </div>
            <div className="dash-heatmap-wrap">
              <div className="dash-heatmap-grid">
                {heatmap.map((d, i) => (
                  <div
                    key={d.key}
                    className="dash-heat-cell"
                    style={{ background: heatColor(d.count) }}
                    title={`${d.date.toLocaleDateString("tr-TR")}: ${d.count || 0} soru`}
                  />
                ))}
              </div>
            </div>
            <div className="dash-heat-legend">
              <span>Az</span>
              {[0.18, 0.38, 0.58, 0.78, 1].map((v) => (
                <div key={v} className="dash-heat-cell" style={{ background: `rgba(255,179,0,${v})` }} />
              ))}
              <span>Çok</span>
            </div>
          </div>

          {/* ── Donut + Weekly ─────────────────────────────────────────── */}
          <div className="dash-row-2col">
            <div className="dashboard-donut-box">
              <div className="dash-donut" style={{ background: donutGrad }}>
                <div className="dash-donut-center">
                  <strong>%{donutRate}</strong>
                  <span>Genel</span>
                </div>
              </div>
              <div className="dash-donut-info">
                <h3>Genel Başarı</h3>
                <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.45)", margin: "0 0 0.6rem" }}>
                  Tüm modüllerin birleşik ortalaması
                </p>
                <div className="dash-donut-legend">
                  <span>📖 Kelime: %{successRate}</span>
                  <span>🔁 Synonyms: %{synRate}</span>
                  <span>🧩 Phrasal: %{phrRate}</span>
                  <span>🎙️ Speaking: %{spkRate}</span>
                </div>
              </div>
            </div>

            <div className="weekly-chart-box">
              <h3>Haftalık Çalışma</h3>
              <div className="weekly-chart">
                {chartData.map((item) => (
                  <div className="bar-col" key={item.key}>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ height: item.studied > 0 ? `${Math.max(6, (item.studied / maxBar) * 100)}%` : "0%" }}
                        title={`${item.studied} soru`}
                      />
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── CEFR Progress ─────────────────────────────────────────── */}
          <div className="dash-cefr-box">
            <div className="dash-section-header">
              <h3>CEFR Seviye Dağılımı</h3>
              <span className="dash-section-sub">Öğrenilen kelimeler</span>
            </div>
            <div className="dash-cefr-grid">
              {cefrData.map(({ level, count, pct, color }) => (
                <div key={level} className="dash-cefr-row">
                  <span className="dash-cefr-badge" style={{ color, borderColor: color + "55", background: color + "15" }}>
                    {level}
                  </span>
                  <div className="dash-cefr-bar-track">
                    <div
                      className="dash-cefr-bar-fill"
                      style={{ width: `${pct}%`, background: color }}
                      title={`${count} kelime`}
                    />
                  </div>
                  <span className="dash-cefr-count">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Module Stats ──────────────────────────────────────────── */}
          <div className="module-stats-box">
            <h3>Modül İstatistikleri</h3>
            <div className="module-grid">
              {[
                { label: "🔁 Synonyms",  data: syn, rate: synRate, color: "#45b7d1" },
                { label: "🧩 Phrasal",   data: phr, rate: phrRate, color: "#96ceb4" },
                { label: "🎙️ Speaking",  data: spk, rate: spkRate, color: "#ff9f1c" },
              ].map(({ label, data, rate, color }) => (
                <div key={label} className="module-card dash-mod-v2">
                  <h4>{label}</h4>
                  <div className="dash-mod-rate-row">
                    <span className="dash-mod-rate" style={{ color }}>{rate}%</span>
                    <span className="dash-mod-total">{data.attempted} soru</span>
                  </div>
                  <div className="dash-mod-bar-track">
                    <div className="dash-mod-bar" style={{ width: `${rate}%`, background: color }} />
                  </div>
                  <div className="dash-mod-footer">
                    <span>✅ {data.correct}</span>
                    <span>❌ {data.wrong}</span>
                    <span>🔥 {data.bestStreak} seri</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Personal Records ──────────────────────────────────────── */}
          <div className="dash-records-box">
            <div className="dash-section-header">
              <h3>🏆 Kişisel Rekorlar</h3>
            </div>
            <div className="dash-records-grid">
              {[
                { icon: "🔥", val: bestStreak,              label: "En Uzun Seri" },
                { icon: "⭐", val: xp.toLocaleString("tr-TR"), label: "Toplam XP" },
                { icon: "📅", val: activeDays,              label: "Aktif Gün" },
                { icon: "🎯", val: totalModuleQ,            label: "Modül Sorusu" },
                { icon: "💡", val: stats.known,             label: "Öğrenilen Kelime" },
                { icon: "📝", val: wrongWords.length,       label: "Çalışılacak" },
              ].map(({ icon, val, label }) => (
                <div key={label} className="dash-rec-item">
                  <span className="dash-rec-icon">{icon}</span>
                  <span className="dash-rec-val">{val}</span>
                  <span className="dash-rec-lbl">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Hardest Words ─────────────────────────────────────────── */}
          <div className="hard-words-box">
            <h3>En Çok Zorlanılan Kelimeler</h3>
            {hardestWords.length === 0 ? (
              <p className="empty">Henüz yeterli veri yok. Biraz daha çalış ve tekrar bak.</p>
            ) : (
              <div className="hard-word-grid">
                {hardestWords.map((w) => (
                  <div key={w.term} className="hard-word-item">
                    <strong>{w.term}</strong>
                    <span>{w.level}</span>
                    <em>{w.count} kez</em>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Recent Words ──────────────────────────────────────────── */}
          <div className="recent-words-box">
            <h3>Son Çalışılan Kelimeler</h3>
            {recentWords.length === 0 ? (
              <p className="empty">Henüz çalışma geçmişi yok.</p>
            ) : (
              <div className="recent-tags">
                {recentWords.map((term, idx) => (
                  <span key={`${term}-${idx}`}>{term}</span>
                ))}
              </div>
            )}
          </div>

          <AdSlot slot={slotInline} className="ad-slot ad-inline" isPremium={isPremium} />
        </div>

        <aside className="dashboard-sidebar">
          <div className="dash-side-card">
            <h3>Destek</h3>
            <p className="dash-muted">
              Ücretsiz kullanım reklamlarla desteklenir. Premium'da reklamlar kapalıdır.
            </p>
          </div>
          <AdSlot slot={slotSide} className="ad-slot ad-sidebar" isPremium={isPremium} />
        </aside>
      </div>

      <div className="dashboard-footnote">
        Yanlış listende {wrongWords.length} kelime var. Zorlandığın kelimeleri düzenli tekrar et.
      </div>
    </div>
  );
};

export default DashboardView;
