import React, { useCallback } from "react";
import { PrivacyLegalBody, TermsLegalBody } from "./LegalBodies";
import "./LegalPages.css";
import "./SiteInfoPage.css";

const TABS = [
  { id: "features", label: "Özellikler" },
  { id: "about", label: "Hakkında" },
  { id: "privacy", label: "Gizlilik" },
  { id: "terms", label: "Şartlar" },
];

/** Özellikler sekmesi: içindekiler + bölüm gövdeleri (tek kaynak) */
const FEATURE_SECTIONS = [
  {
    id: "ozellik-cekirdek",
    title: "Çekirdek çalışma",
    body: (
      <ul>
        <li>
          <strong>Çalışma:</strong> Seviye seçimli kelime kartları; bildim ve bilemedim akışı, ipucu ve örnek cümle,
          sesli okuma.
        </li>
        <li>
          <strong>Test:</strong> Kelime havuzundan sınav tarzı değerlendirme; yanlışları sonradan tekrar listesine
          aktarma.
        </li>
        <li>
          <strong>Panel (dashboard):</strong> Çalışma geçmişi, özet istatistikler ve modül bazlı performans görünümü.
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-listeler",
    title: "Listeler ve kelime yönetimi",
    body: (
      <ul>
        <li>
          <strong>Listeler menüsü:</strong> Tüm kelimeler, eş anlamlılar (Synonyms) listesi, phrasal fiiller listesi,
          yanlışlar ve favoriler; arama ve filtreleme ile.
        </li>
        <li>
          <strong>Favoriler:</strong> Kelime, eş anlamlı ve phrasal öğelerini ayrı ayrı işaretleme.
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-oyun",
    title: "Oyun ve rekabet",
    body: (
      <ul>
        <li>
          <strong>Eşleştirme:</strong> Kelime–anlam eşleştirme oyunu.
        </li>
        <li>
          <strong>Liderlik:</strong> Skor tablosu; premium kullanıcılarda rozet ve PRO görünümü (uygulama ayarlarına
          bağlıdır).
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-es-anlamli",
    title: "Eş anlamlılar ve phrasal fiiller",
    body: (
      <ul>
        <li>
          Ayrı çalışma ekranları: eş anlamlı ve phrasal fiil soruları; yanıtlarınız istatistik ve sınıf analitiği için
          kayda geçer.
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-yapay-zeka",
    title: "Yapay zekâ: AI Yazım ve AI Sohbet (Wordy)",
    body: (
      <ul>
        <li>
          <strong>AI Yazım:</strong> Tür, ton, uzunluk ve dil seçenekleriyle metin üretimi; akışlı (stream) çıktı;
          hızlı düzenleme kipleri (netleştirme, kısaltma, genişletme vb.).
        </li>
        <li>
          <strong>AI Sohbet:</strong> Çoklu sohbet (konuşma dizisi), geçmiş mesajlar, isteğe bağlı metin dosyası ekleme
          (.txt, .md, .csv, .json). Asistanın adı Wordy&apos;dir; ücretli planda uzun bağlam ve özet sayesinde
          kişiselleştirilmiş yanıtlar sunulur.
        </li>
        <li>
          Ücretsiz kullanımda günlük yapay zekâ kotası bulunur; Premium veya AI+ ile erişim genişletilir (uygulama
          kuralları geçerlidir).
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-odeme",
    title: "Ödeme ve planlar",
    body: (
      <ul>
        <li>
          <strong>Fiyatlar:</strong> WordBoost Premium, AI+ ve okul veya sınıf paketleri; Paddle üzerinden ödeme ve
          faturalama portalı (sunucu ortam değişkenleriyle yapılandırılır).
        </li>
        <li>
          Paket kartlarında görünen tutarlar sunucudaki plan tanımlarıyla eşleşebilir; özel teklif için iletişim
          e-postası kullanılabilir.
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-sinif",
    title: "Sınıf (Classroom)",
    body: (
      <ul>
        <li>
          Öğretmen ve sınıf akışı: sınıf kodu, üyelik, ilerleme ve analitik (uygulama sürümüne göre CSV ile toplu içe
          aktarma vb.).
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-oda",
    title: "Oda (çok oyunculu)",
    body: (
      <ul>
        <li>
          Oda oluşturma ve katılma; Socket.io ile canlı katılımcı listesi ve oda içi çalışma (menüden erişilir).
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-hesap",
    title: "Hesap ve profil",
    body: (
      <ul>
        <li>Google ile giriş; profil, avatar, herkese açık profil ve rozetler.</li>
        <li>
          Çerez ve reklam tercihleri; premium durumu ve Paddle müşteri portalına yönlendirme (kuruluma bağlıdır).
        </li>
      </ul>
    ),
  },
  {
    id: "ozellik-mobil",
    title: "Mobil kullanım ve erişilebilirlik",
    body: (
      <ul>
        <li>
          Arayüz, dar ekranlarda menü çekmecesi, güvenli alan (çentikli cihazlar) ve yeterli dokunma hedefleri gözetilerek
          düzenlenir.
        </li>
      </ul>
    ),
  },
];

function scrollToFeatureSection(elementId) {
  const el = typeof document !== "undefined" ? document.getElementById(elementId) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  const focusable = el.querySelector("h2");
  if (focusable && typeof focusable.focus === "function") {
    try {
      focusable.setAttribute("tabIndex", "-1");
      focusable.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }
}

export default function SiteInfoPage({ tab, onTabChange, onBack }) {
  const safeTab = TABS.some((t) => t.id === tab) ? tab : "features";

  const onTocClick = useCallback((e, sectionId) => {
    e.preventDefault();
    scrollToFeatureSection(sectionId);
  }, []);

  return (
    <div className="site-info-page">
      <button type="button" className="legal-back site-info-back" onClick={onBack}>
        ← Uygulamaya dönün
      </button>

      <p className="site-info-tab-legend" id="site-info-tab-legend">
        Aşağıdaki dört düğme <strong>site genelinde</strong> sekme değiştirir (Özellikler, Hakkında, Gizlilik, Şartlar).
      </p>
      <div
        className="site-info-tabs"
        role="tablist"
        aria-label="Bilgi merkezi sekmeleri"
        aria-describedby="site-info-tab-legend"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={safeTab === t.id}
            className={`site-info-tab ${safeTab === t.id ? "site-info-tab--active" : ""}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="site-info-panel" role="tabpanel">
        {safeTab === "features" && <FeaturesTabContent onTocClick={onTocClick} />}
        {safeTab === "about" && <AboutTabContent />}
        {safeTab === "privacy" && (
          <div className="site-info-legal-wrap">
            <PrivacyLegalBody />
          </div>
        )}
        {safeTab === "terms" && (
          <div className="site-info-legal-wrap">
            <TermsLegalBody />
          </div>
        )}
      </div>

      {safeTab === "features" && (
        <footer className="site-info-footer-legal">
          <p className="site-info-footer-hint">
            Yasal metinler için üstteki <strong>sekme</strong> düğmelerinden Gizlilik veya Şartlar&apos;ı seçebilirsiniz.
          </p>
          <div className="site-info-footer-links">
            <button type="button" className="site-info-linkish" onClick={() => onTabChange("privacy")}>
              Gizlilik politikası
            </button>
            <span aria-hidden> · </span>
            <button type="button" className="site-info-linkish" onClick={() => onTabChange("terms")}>
              Kullanım şartları
            </button>
            <span aria-hidden> · </span>
            <a href="/pricing">Fiyatlandırma</a>
          </div>
        </footer>
      )}
    </div>
  );
}

function AboutTabContent() {
  return (
    <article className="site-info-article">
      <h1 className="site-info-hero-title">WordBoost hakkında</h1>
      <p className="site-info-lead">
        WordBoost, YDT ve genel İngilizce hedefleriniz için tasarlanmış bir kelime ve dil pratiği platformudur. Çalışma,
        test, istatistik, yapay zekâ destekli yazım ve sohbet ile sınıf ve oda deneyimlerini tek çatı altında toplar.
      </p>

      <section className="site-info-block">
        <h2>Wordy — yapay zekâ asistanı</h2>
        <p>
          Sohbet modunda asistanımızın adı <strong>Wordy</strong>&apos;dir (WordBoost maskotu). Wordy, bağlamınızı ve
          ücretli planda konuşma özetinizi dikkate alarak kişiselleştirilmiş geri bildirim verir; yazım modunda ise deneme,
          e-posta ve sınav türü metinlerde yardımcı olur.
        </p>
      </section>

      <section className="site-info-block">
        <h2>Kimler için?</h2>
        <ul>
          <li>YDT ve benzeri sınavlara hazırlanan öğrenciler</li>
          <li>Kelime dağarcığını sistematik biçimde geliştirmek isteyen herkes</li>
          <li>Sınıf veya kurumla toplu pratik yürüten öğretmenler (Classroom)</li>
        </ul>
      </section>

      <section className="site-info-block">
        <h2>İletişim</h2>
        <p>
          Paketler ve kurumsal teklifler için:{" "}
          <a href="mailto:wordboost.team@gmail.com">wordboost.team@gmail.com</a>
        </p>
      </section>
    </article>
  );
}

function FeaturesTabContent({ onTocClick }) {
  return (
    <article className="site-info-article site-info-article--features">
      <h1 className="site-info-hero-title">WordBoost özellikleri</h1>
      <p className="site-info-lead">
        Uygulamadaki başlıca modüller aşağıda özetlenmiştir. Üst menüden her birine doğrudan geçebilirsiniz; bu sayfa ise
        &quot;WordBoost neler sunuyor?&quot; sorusuna tek bakışta yanıt verir.
      </p>

      <nav className="site-info-toc" aria-label="Özellikler sayfası içindekiler">
        <div className="site-info-toc-header">
          <span className="site-info-toc-badge">İçindekiler</span>
          <h2 className="site-info-toc-title">Bölümlere git</h2>
        </div>
        <p className="site-info-toc-hint" id="site-info-toc-hint-text">
          Bu listedeki düğmeler <strong>yalnızca aşağı kaydırır</strong>; üstteki Özellikler, Hakkında, Gizlilik ve
          Şartlar <strong>sekme</strong> düğmelerini değiştirmez.
        </p>
        <ol className="site-info-toc-list" role="list">
          {FEATURE_SECTIONS.map((s, idx) => (
            <li key={s.id} role="listitem">
              <button
                type="button"
                className="site-info-toc-btn"
                onClick={(e) => onTocClick(e, s.id)}
                aria-describedby="site-info-toc-hint-text"
              >
                <span className="site-info-toc-num" aria-hidden>
                  {idx + 1}.
                </span>
                <span className="site-info-toc-label">{s.title}</span>
                <span className="site-info-toc-arrow" aria-hidden>
                  ↓
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="site-info-sections">
        {FEATURE_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="site-info-block site-info-anchor" aria-labelledby={`${s.id}-heading`}>
            <h2 id={`${s.id}-heading`} className="site-info-section-h2" tabIndex={-1}>
              {s.title}
            </h2>
            {s.body}
          </section>
        ))}
      </div>

      <p className="site-info-note">
        Özellikler zaman içinde güncellenebilir. Kesin hukuki metinler için üstteki <strong>Gizlilik</strong> ve{" "}
        <strong>Şartlar</strong> sekmelerine bakınız.
      </p>
    </article>
  );
}
