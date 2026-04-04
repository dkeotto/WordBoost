import React from "react";

/** Gizlilik metni — PrivacyPage ve SiteInfoPage (sekme) ortak */
export function PrivacyLegalBody() {
  return (
    <>
      <header className="legal-header">
        <h1>Gizlilik politikası</h1>
        <p className="legal-meta">
          Son güncelleme: bu sayfa genel bilgilendirme amaçlıdır; yayından önce hukuki inceleme önerilir.
        </p>
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
    </>
  );
}

/** Kullanım şartları metni — TermsPage ve SiteInfoPage (sekme) ortak */
export function TermsLegalBody() {
  return (
    <>
      <header className="legal-header">
        <h1>Kullanım şartları</h1>
        <p className="legal-meta">
          Son güncelleme: bu sayfa genel bilgilendirme amaçlıdır; yayından önce hukuki inceleme önerilir.
        </p>
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
    </>
  );
}
