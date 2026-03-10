import React, { memo } from 'react';

const StatsPanel = memo(({ stats, resetStats, isInRoom, practiceLevel, setPracticeLevel }) => (
    <div className="stats-container">
      <div className="stats">
        <div className="stat">
          <span>Çalışılan</span>
          <strong>{stats.studied}</strong>
        </div>
        <div className="stat known">
          <span>Biliyorum</span>
          <strong>{stats.known}</strong>
        </div>
        <div className="stat unknown">
          <span>Bilmiyorum</span>
          <strong>{stats.unknown}</strong>
        </div>
        <button className="reset-btn" onClick={resetStats}>Sıfırla</button>
      </div>

      {!isInRoom && (
        <div className="level-selector-embedded">
          <label>Çalışma Seviyesi:</label>
          <select 
            value={practiceLevel} 
            onChange={(e) => setPracticeLevel(e.target.value)}
          >
            <option value="ALL">Tümü (Karma)</option>
            <option value="A1-A2">A1 - A2</option>
            <option value="B1-B2">B1 - B2</option>
            <option value="B1-C2">B1 - C2</option>
            <option value="C1-C2">C1 - C2</option>
            <option disabled>──────────</option>
            <option value="A1">Sadece A1</option>
            <option value="A2">Sadece A2</option>
            <option value="B1">Sadece B1</option>
            <option value="B2">Sadece B2</option>
            <option value="C1">Sadece C1</option>
            <option value="C2">Sadece C2</option>
          </select>
        </div>
      )}
    </div>
));

export default StatsPanel;
