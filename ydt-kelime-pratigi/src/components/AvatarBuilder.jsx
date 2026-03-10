import React, { useState } from 'react';

const AvatarBuilder = ({ initialSeed, setEditForm, handleFileChange, onClose }) => {
  const [seed, setSeed] = useState(initialSeed);
  const [bg, setBg] = useState("b6e3f4");
  
  const updateAvatar = (newSeed) => {
    setSeed(newSeed);
    setEditForm(prev => ({
      ...prev, 
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${newSeed}&backgroundColor=${bg}`
    }));
  };

  const colors = [
    "f8d9ce", "f4c5b5", "eabbae", "d6a598", "b98375", "966052", "6c4238",
    "2c2c2c", "4a3b32", "6d4c41", "8d6e63", "d7ccc8", "fafafa", "ffeb3b",
    "f44336", "e91e63", "9c27b0", "673ab7", "3f51b5", "2196f3", "03a9f4",
    "00bcd4", "009688", "4caf50", "8bc34a", "cddc39", "ffc107", "ff9800",
    "ff5722", "795548", "607d8b",
    "b6e3f4", "c0aede", "d1d4f9", "ffdfbf", "ffd4c2", "ffe5ec",
    "d4e157", "ff7043", "bdbdbd", "78909c"
  ];

  return (
    <div className="avatar-builder-overlay" onClick={(e) => {
      if (e.target.className === 'avatar-builder-overlay') onClose();
    }}>
      <div className="avatar-builder">
        <div className="builder-header">
          <span>Avatar Oluşturucu</span>
          <button className="close-builder-btn" onClick={onClose}>×</button>
        </div>
        <div className="builder-controls">
          <button onClick={() => updateAvatar(Math.random().toString(36))} title="Rastgele" className="random-btn">🎲 Karıştır</button>
          <div className="color-picker-container">
            <p className="color-label">Arkaplan Rengi:</p>
            <div className="color-picker">
              {colors.map(color => (
                <div 
                  key={color} 
                  className={`color-dot ${bg === color ? 'selected' : ''}`} 
                  style={{background: `#${color}`}}
                  onClick={() => {
                    setBg(color);
                    setEditForm(prev => ({
                      ...prev, 
                      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=${color}`
                    }));
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="upload-section">
           <label className="upload-text-btn">
             📂 Kendi Fotoğrafını Yükle
             <input 
               type="file" 
               accept="image/*" 
               onChange={handleFileChange}
               style={{display: 'none'}} 
             />
           </label>
        </div>
      </div>
    </div>
  );
};

export default AvatarBuilder;
