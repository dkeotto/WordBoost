import React, { useMemo, useState, useEffect } from "react";
import AdSlot from "./AdSlot";
import { getConsentStatus, openConsentDialog } from "../utils/consentStorage";

const DAYS_TR = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"];

const formatDayKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const DashboardView = ({ stats, practiceHistory, wrongWords, moduleStats, user }) => {
  const [consentStatus, setConsentStatus] = useState(() => getConsentStatus().status);
  useEffect(() => {
    const onChange = () => setConsentStatus(getConsentStatus().status);
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  const nowMs = Date.now();
  const isPremium = Boolean(
    user?.isPremium ||
      (user?.premiumUntil && new Date(user.premiumUntil).getTime() > nowMs)
  );
  const adsClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const slotSidebar = import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_SIDEBAR;
  const slotInline = import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_INLINE;
  const adsConfigured = Boolean(adsClient && slotSidebar && slotInline);
  const adsMissingKeys = useMemo(() => {
    const keys = [];
    if (!adsClient) keys.push("VITE_ADSENSE_CLIENT");
    if (!slotSidebar) keys.push("VITE_ADSENSE_SLOT_DASHBOARD_SIDEBAR");
    if (!slotInline) keys.push("VITE_ADSENSE_SLOT_DASHBOARD_INLINE");
    return keys;
  }, [adsClient, slotSidebar, slotInline]);
  const last7Days = useMemo(() => {
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      days.push({
        key: formatDayKey(d),
        label: DAYS_TR[d.getDay()],
        studied: 0,
        known: 0,
      });
    }
    return days;
  }, []);

  const chartData = useMemo(() => {
    const map = new Map(last7Days.map((d) => [d.key, { ...d }]));
    practiceHistory.forEach((item) => {
      if (!item || !item.date) return;
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return;
      const key = formatDayKey(date);
      const existing = map.get(key);
      if (!existing) return;
      existing.studied += 1;
      if (item.isKnown) existing.known += 1;
    });
    return Array.from(map.values());
  }, [last7Days, practiceHistory]);

  const weeklyStudied = chartData.reduce((acc, d) => acc + d.studied, 0);
  const weeklyKnown = chartData.reduce((acc, d) => acc + d.known, 0);
  const successRate = weeklyStudied ? Math.round((weeklyKnown / weeklyStudied) * 100) : 0;
  const maxValue = Math.max(...chartData.map((d) => d.studied), 1);

  const hardestWords = useMemo(() => {
    const hardMap = new Map();
    practiceHistory.forEach((item) => {
      if (!item || item.isKnown || !item.term) return;
      const existing = hardMap.get(item.term) || {
        term: item.term,
        level: item.level || "?",
        count: 0,
      };
      existing.count += 1;
      hardMap.set(item.term, existing);
    });

    return Array.from(hardMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [practiceHistory]);

  const activeDays = useMemo(() => {
    const days = new Set();
    practiceHistory.forEach((item) => {
      if (!item?.date) return;
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return;
      days.add(formatDayKey(date));
    });
    return days.size;
  }, [practiceHistory]);

  const recentWords = useMemo(() => {
    return [...practiceHistory]
      .slice(-5)
      .reverse()
      .map((item) => item.term)
      .filter(Boolean);
  }, [practiceHistory]);

  const syn = moduleStats?.synonyms || { attempted: 0, correct: 0, wrong: 0, bestStreak: 0 };
  const phr = moduleStats?.phrasal  || { attempted: 0, correct: 0, wrong: 0, bestStreak: 0 };
  const spk = moduleStats?.speaking  || { attempted: 0, correct: 0, wrong: 0, bestStreak: 0 };
  const synRate = syn.attempted ? Math.round((syn.correct / syn.attempted) * 100) : 0;
  const phrRate = phr.attempted ? Math.round((phr.correct / phr.attempted) * 100) : 0;
  const spkRate = spk.attempted ? Math.round((spk.correct / spk.attempted) * 100) : 0;
  // Only include modules that have been used in the donut average
  const activeRates = [successRate, synRate, phrRate, spkRate].filter((_, i) =>
    i === 0 || [syn, phr, spk][i - 1].attempted > 0
  );
  const donutRate = activeRates.length ? Math.round(activeRates.reduce((a, b) => a + b, 0) / activeRates.length) : 0;
  const donutGradient = `conic-gradient(#ffb300 0% ${donutRate}%, rgba(255,255,255,0.08) ${donutRate}% 100%)`;

  const showAdsHint =
    !isPremium && adsConfigured && consentStatus !== "accepted";

  return (
    <div className="dashboard-view">
      <h2>İlerleme Takip Paneli</h2>

      {!isPremium && !adsConfigured && import.meta.env.PROD && (
        <p className="dash-ads-dev-hint">
          Reklamlar için <code>VITE_*</code> değişkenleri <strong>Vite build</strong> sırasında gömülür (runtime’da
          backend .env okunmaz). Railway vb. için <strong>frontend</strong> servisinde Variables tanımlayıp{" "}
          <strong>yeniden build + deploy</strong> gerekir. Şu an eksik:{" "}
          {adsMissingKeys.map((k, i) => (
            <React.Fragment key={k}>
              {i > 0 ? ", " : null}
              <code>{k}</code>
            </React.Fragment>
          ))}
          . Slot ID’leri Google AdSense’te oluşturduğun <strong>reklam birimlerinin</strong> sayısal kimliği; yereldeki{" "}
          <code>ydt-kelime-pratigi/.env</code> ile aynı değerleri Railway frontend Variables’a yazabilirsin.
        </p>
      )}

      {showAdsHint && (
        <div className="dash-ads-consent-hint" role="status">
          <span>
            Kişiselleştirilmiş reklamlar için çerezleri kabul etmen gerekir. Henüz seçim yapmadıysan genel (kişiselleştirilmemiş)
            reklamlar gösterilebilir; reddettiysen reklam alanları boş kalır.
          </span>
          <button type="button" className="dash-ads-consent-btn" onClick={() => openConsentDialog()}>
            Çerez tercihini aç
          </button>
        </div>
      )}

      <div className="dashboard-layout">
        <div className="dashboard-main">
          <div className="dashboard-cards">
            <div className="dashboard-card">
              <span>Toplam Öğrenilen Kelime</span>
              <strong>{stats.known}</strong>
            </div>
            <div className="dashboard-card">
              <span>Bu Hafta Çalışılan Kelime</span>
              <strong>{weeklyStudied}</strong>
            </div>
            <div className="dashboard-card">
              <span>Haftalık Başarı Oranı</span>
              <strong>%{successRate}</strong>
            </div>
            <div className="dashboard-card">
              <span>Aktif Çalışılan Gün</span>
              <strong>{activeDays}</strong>
            </div>
          </div>

          <div className="dashboard-donut-box">
            <div className="dash-donut" style={{ background: donutGradient }}>
              <div className="dash-donut-center">
                <strong>%{donutRate}</strong>
                <span>Genel</span>
              </div>
            </div>
            <div className="dash-donut-info">
              <h3>Genel Başarı Özeti</h3>
              <p>Kelime, Synonyms, Phrasal Verbs ve Speaking performanslarının birleşik göstergesi.</p>
              <div className="dash-donut-legend">
                <span>Kelime: %{successRate}</span>
                <span>Synonyms: %{synRate}</span>
                <span>Phrasal: %{phrRate}</span>
                <span>Speaking: %{spkRate}</span>
              </div>
            </div>
          </div>

          <div className="weekly-chart-box">
            <h3>Haftalık Çalışma Grafiği</h3>
            <div className="weekly-chart">
              {chartData.map((item) => (
                <div className="bar-col" key={item.key}>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ height: item.studied > 0 ? `${Math.max(6, (item.studied / maxValue) * 100)}%` : "0%" }}
                      title={`${item.studied} kelime`}
                    />
                  </div>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

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
                    <em>{w.count} kez zorlanıldı</em>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="module-stats-box">
            <h3>Modül İstatistikleri</h3>
            <div className="module-grid">
              <div className="module-card">
                <h4>Synonyms</h4>
                <p>Toplam Soru: {syn.attempted}</p>
                <p>Başarı: %{synRate}</p>
                <p>En İyi Seri: {syn.bestStreak}</p>
              </div>
              <div className="module-card">
                <h4>Phrasal Verbs</h4>
                <p>Toplam Soru: {phr.attempted}</p>
                <p>Başarı: %{phrRate}</p>
                <p>En İyi Seri: {phr.bestStreak}</p>
              </div>
              <div className="module-card">
                <h4>🎙️ Speaking</h4>
                <p>Toplam Soru: {spk.attempted}</p>
                <p>Başarı: %{spkRate}</p>
                <p>En İyi Seri: {spk.bestStreak}</p>
              </div>
            </div>
          </div>

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
              Ücretsiz kullanım reklamlarla desteklenir. Premium’da reklamlar kapalıdır.
            </p>
          </div>
          <AdSlot slot={slotSidebar} className="ad-slot ad-sidebar" isPremium={isPremium} />
        </aside>
      </div>

      <div className="dashboard-footnote">
        Yanlis listende {wrongWords.length} kelime var. Zorlandigin kelimeleri duzenli tekrar et.
      </div>
    </div>
  );
};

export default DashboardView;
