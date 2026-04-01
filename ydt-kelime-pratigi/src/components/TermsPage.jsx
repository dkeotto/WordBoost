import React from "react";
import "./LegalPages.css";

export default function TermsPage({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      <header className="legal-header">
        <h1>Kullanım şartları</h1>
        <p className="legal-meta">Son güncelleme: bu sayfa genel bilgilendirme amaçlıdır; yayından önce hukuki inceleme önerilir.</p>
      </header>

      <section className="legal-section">
        <h2>Hizmet</h2>
        <p>
          Bu site, İngilizce kelime pratiği ve ilgili eğitim özellikleri sunar. Özellikler zaman içinde güncellenebilir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Hesap</h2>
        <p>
          Hesap bilgilerinizi gizli tutmak sizin sorumluluğunuzdadır. Şüpheli kullanım tespit edilirse hesap askıya
          alınabilir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Ücretli özellikler</h2>
        <p>
          Ücretli planlar ödeme sağlayıcısı (Paddle) üzerinden faturalandırılır. İade ve iptal koşulları ödeme
          ekranındaki bilgilere tabidir.
        </p>
      </section>

      <section className="legal-section">
        <h2>İletişim</h2>
        <p>Destek için sitede belirttiğiniz iletişim kanallarını kullanın.</p>
      </section>

      <footer className="legal-footer">
        <a href="/pricing">Fiyatlandırma</a>
        <span aria-hidden> · </span>
        <a href="/privacy">Gizlilik</a>
      </footer>
    </div>
  );
}
