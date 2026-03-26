import React, { useMemo } from "react";

const DAYS_TR = ["Paz", "Pzt", "Sal", "Car", "Per", "Cum", "Cmt"];

const formatDayKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const DashboardView = ({ stats, practiceHistory, wrongWords, moduleStats }) => {
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
  const phr = moduleStats?.phrasal || { attempted: 0, correct: 0, wrong: 0, bestStreak: 0 };
  const synRate = syn.attempted ? Math.round((syn.correct / syn.attempted) * 100) : 0;
  const phrRate = phr.attempted ? Math.round((phr.correct / phr.attempted) * 100) : 0;

  return (
    <div className="dashboard-view">
      <h2>Ilerleme Takip Paneli</h2>

      <div className="dashboard-cards">
        <div className="dashboard-card">
          <span>Toplam Ogrenilen Kelime</span>
          <strong>{stats.known}</strong>
        </div>
        <div className="dashboard-card">
          <span>Bu Hafta Calisilan Kelime</span>
          <strong>{weeklyStudied}</strong>
        </div>
        <div className="dashboard-card">
          <span>Haftalik Basari Orani</span>
          <strong>%{successRate}</strong>
        </div>
        <div className="dashboard-card">
          <span>Aktif Calisilan Gun</span>
          <strong>{activeDays}</strong>
        </div>
      </div>

      <div className="weekly-chart-box">
        <h3>Haftalik Calisma Grafigi</h3>
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
        <h3>En Cok Zorlanilan Kelimeler</h3>
        {hardestWords.length === 0 ? (
          <p className="empty">Henuz yeterli veri yok. Biraz daha calis ve tekrar bak.</p>
        ) : (
          <div className="hard-word-grid">
            {hardestWords.map((w) => (
              <div key={w.term} className="hard-word-item">
                <strong>{w.term}</strong>
                <span>{w.level}</span>
                <em>{w.count} kez zorlandi</em>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="module-stats-box">
        <h3>Modul Istatistikleri</h3>
        <div className="module-grid">
          <div className="module-card">
            <h4>Synonyms</h4>
            <p>Toplam Soru: {syn.attempted}</p>
            <p>Basari: %{synRate}</p>
            <p>En Iyi Seri: {syn.bestStreak}</p>
          </div>
          <div className="module-card">
            <h4>Phrasal Verbs</h4>
            <p>Toplam Soru: {phr.attempted}</p>
            <p>Basari: %{phrRate}</p>
            <p>En Iyi Seri: {phr.bestStreak}</p>
          </div>
        </div>
      </div>

      <div className="recent-words-box">
        <h3>Son Calisilan Kelimeler</h3>
        {recentWords.length === 0 ? (
          <p className="empty">Henuz calisma gecmisi yok.</p>
        ) : (
          <div className="recent-tags">
            {recentWords.map((term, idx) => (
              <span key={`${term}-${idx}`}>{term}</span>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-footnote">
        Yanlis listende {wrongWords.length} kelime var. Zorlandigin kelimeleri duzenli tekrar et.
      </div>
    </div>
  );
};

export default DashboardView;
