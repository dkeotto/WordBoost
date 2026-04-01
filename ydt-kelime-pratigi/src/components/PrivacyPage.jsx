import React from "react";
import "./LegalPages.css";

export default function PrivacyPage({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      <header className="legal-header">
        <h1>Gizlilik politikası</h1>
        <p className="legal-meta">Son güncelleme: bu sayfa genel bilgilendirme amaçlıdır; yayından önce hukuki inceleme önerilir.</p>
      </header>

      <section className="legal-section">
        <h2>Toplanan veriler</h2>
        <p>
          Hesap oluşturma, çalışma istatistikleri ve hizmeti iyileştirmek için gerekli teknik veriler işlenebilir.
          Ödeme işlemlerinde ödeme sağlayıcısı (Paddle) devreye girer.
        </p>
      </section>

      <section className="legal-section">
        <h2>Çerezler ve reklamlar</h2>
        <p>
          Reklam göstermek için çerez onayı istenebilir. Premium kullanıcılara reklam gösterilmez (uygulama ayarına göre).
        </p>
      </section>

      <section className="legal-section">
        <h2>Üçüncü taraflar</h2>
        <p>
          Yapay zeka özellikleri için API sağlayıcıları (ör. Anthropic) kullanılabilir; gönderilen metinler sağlayıcı
          politikalarına tabidir.
        </p>
      </section>

      <section className="legal-section">
        <h2>Haklarınız</h2>
        <p>KVKK / GDPR kapsamındaki haklarınız için bizimle iletişime geçebilirsiniz.</p>
      </section>

      <footer className="legal-footer">
        <a href="/pricing">Fiyatlandırma</a>
        <span aria-hidden> · </span>
        <a href="/terms">Kullanım şartları</a>
      </footer>
    </div>
  );
}
