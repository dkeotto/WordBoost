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
      <>
        <p className="site-info-section-lead">
          WordBoost&apos;un kalbi: kelimeyi bağlamda görmek, hızlı karar vermek ve tekrarı akıllıca planlamak. Aynı
          ekosistem içinde karttan teste, testten panele kesintisiz geçiş.
        </p>
        <ul>
          <li>
            <strong>Çalışma modu:</strong> A1&apos;den C2&apos;ye seviye seçimi; çift yüzlü kartlarla kelime–anlam
            pratiği. Bildim ve bilemedim akışı ilerlemenizi kayda alır; ipucu ve örnek cümle ile kelimeyi cümle içinde
            görürsünüz; sesli okuma ile telaffuzu pekiştirirsiniz.
          </li>
          <li>
            <strong>Test modu:</strong> Geniş havuzdan çoktan seçmeli ve sınav hissi veren değerlendirme. Yanlış
            girdikleriniz otomatik olarak tekrar listenize düşer; böylece zayıf halkaları bilinçli şekilde kapatırsınız.
          </li>
          <li>
            <strong>Panel (dashboard):</strong> Çalışma oturumlarınızın özeti, bilinen–bilinmeyen dengesi ve modül bazlı
            performans. Ne kadar çalıştığınızı ve hangi alanda ivme kazandığınızı tek ekranda okursunuz; motivasyon ve
            planlama için veri üretir.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-listeler",
    title: "Listeler ve kelime yönetimi",
    body: (
      <>
        <p className="site-info-section-lead">
          Binlerce içerik arasında kaybolmadan ilerlemek için arama, filtre ve kişisel listeler. Kelime, eş anlamlı ve
          phrasal dünyanızı tek çatı altında yönetin.
        </p>
        <ul>
          <li>
            <strong>Listeler menüsü:</strong> Tüm kelimeler; eş anlamlılar (Synonyms) listesi; phrasal fiiller listesi;
            yanlışlar (tekrar adayı havuzunuz); favoriler. Seviye ve arama ile anında daraltma — çalışacağınız seti siz
            belirlersiniz.
          </li>
          <li>
            <strong>Favoriler:</strong> Kelime, synonym ve phrasal öğelerini ayrı kümelerde saklayın. Artık oyunlar (Resim Bulmaca vb.) içinden de tek tıkla favori ekleyebilirsiniz. Sınav öncesi kendi müfredatınızı oluşturun.
          </li>
          <li>
            <strong>Yanlışlar ve tekrar:</strong> Test ve pratikte takıldığınız maddeler birikir; unutmadan, planlı
            tekrar için hazır bir kuyruk sunar.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-oyun",
    title: "Oyun ve rekabet",
    body: (
      <>
        <p className="site-info-section-lead">
          Öğrenmeyi ritim ve rekabetle birleştirin. Hafıza ve hızı aynı anda çalıştıran eşleştirme; toplulukta görünür
          motivasyon sağlayan liderlik tablosu.
        </p>
        <ul>
          <li>
            <strong>Eşleştirme oyunu:</strong> Kelimeyi doğru anlamla eşleştirin; görsel–bilişsel bağ kurarak pekiştirin.
            Klasik kartın ötesinde, oyunlaştırılmış tekrar deneyimi.
          </li>
          <li>
            <strong>Liderlik tablosu:</strong> Skorlarınızı diğer kullanıcılarla kıyaslayın; ilerlemenizi somut bir
            sıralamada görün. Premium üyelikte rozet ve PRO görünümü gibi ayrıcalıklar (uygulama ayarlarına bağlı) profilinizde
            ve listede öne çıkmanıza yardımcı olur.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-es-anlamli",
    title: "Eş anlamlılar ve phrasal fiiller",
    body: (
      <>
        <p className="site-info-section-lead">
          Sınav ve gerçek hayat İngilizcesinde kritik iki kol: kelime zenginliği (synonyms) ve doğal bağlaçlar (phrasal).
          İkisi de ayrı modüllerde, ölçülebilir pratikle gelişir.
        </p>
        <ul>
          <li>
            <strong>Synonyms modülü:</strong> Eş anlamlı seçimi ve bağlam soruları; kelime dağarcığınızı tek kelimede
            sıkışmadan genişletir. Yanıtlarınız istatistiklere ve (varsa) sınıf analitiğine işlenir.
          </li>
          <li>
            <strong>Phrasal modülü:</strong> Fiil + edat kalıplarını tekrar ve test ile oturtur; dinleme ve okumada
            tanıdık gelen yapıları aktif üretime taşır.
          </li>
          <li>
            <strong>Ölçüm ve geri bildirim:</strong> Modül bazlı doğru–yanlış ve seri takibi panelde görünür; zayıf
            alanlara odaklanmanız kolaylaşır.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-yapay-zeka",
    title: "Yapay zekâ: AI Yazım ve AI Sohbet (Wordy)",
    body: (
      <>
        <p className="site-info-section-lead">
          WordBoost&apos;un yapay zekâ katmanı iki yüzüyle gelir: üretken yazım ve süreklilik isteyen sohbet. İkisi de
          akışlı yanıtlar ve WordBoost&apos;a özgü pedagoji odaklı asistan Wordy ile güçlenir.
        </p>
        <ul>
          <li>
            <strong>AI Yazım:</strong> Blog, deneme, e-posta, sosyal metin, özet, YDT tarzı paragraf ve daha fazlası için
            tür ve ton seçimi; uzunluk ve dil (Türkçe açıklamalarla birlikte İngilizce üretim). Metin ekrana satır satır
            akar; netleştirme, kısaltma, genişletme, ton değişimi gibi tek tık düzenleme kipleriyle taslağınızı cilalarsınız.
          </li>
          <li>
            <strong>AI Sohbet (Wordy):</strong> Birden çok konuşma dizisi (thread); geçmiş mesajlar sunucuda saklanır.
            Ücretli planda uzun bağlam ve periyodik özet ile Wordy sizi tanır; YDT, iş İngilizcesi veya günlük pratik
            senaryolarında koçluk tarzı yanıtlar verir. Metin dosyası ekleme (.txt, .md, .csv, .json) ile ödev veya
            makale taslağını doğrudan sohbete taşıyabilirsiniz.
          </li>
          <li>
            <strong>Erişim modeli:</strong> Ücretsiz kullanımda günlük yapay zekâ kotası vardır. Premium veya AI+ ile
            sınırlar genişler; kesin koşullar uygulama ve plan sayfasındaki güncel kurallara tabidir.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-odeme",
    title: "Ödeme ve planlar",
    body: (
      <>
        <p className="site-info-section-lead">
          Şeffaf paket yapısı: kelime pratiğinden yapay zekâya, bireyden sınıfa kadar ihtiyaca göre ölçeklenen WordBoost
          planları. Ödeme altyapısı kurumsal düzeyde güvenilir sağlayıcılarla.
        </p>
        <ul>
          <li>
            <strong>Fiyatlar sayfası:</strong> Premium (abonelik), AI+ (tek seferlik yapay zekâ paketi) ve okul veya
            sınıf çözümleri tek ekranda özetlenir. Gösterilen tutarlar sunucudaki plan ve <code>displayPrice</code>{" "}
            tanımlarıyla uyumlu olabilir; canlı satış için Paddle entegrasyonu kullanılır.
          </li>
          <li>
            <strong>Paddle ile ödeme:</strong> Kart ve abonelik yönetimi, fatura ve müşteri portalı Paddle üzerinden
            yürütülür; WordBoost tarafında haklar (entitlement) güncellenir.
          </li>
          <li>
            <strong>Kurumsal ve özel teklif:</strong> Çoklu lisans veya okul anlaşmaları için doğrudan iletişim hattı
            (ör. <a href="mailto:wordboost.team@gmail.com">wordboost.team@gmail.com</a>) kullanılabilir.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-sinif",
    title: "Sınıf (Classroom)",
    body: (
      <>
        <p className="site-info-section-lead">
          Öğretmenler için tasarlanmış sınıf deneyimi: tek kodla toplanan öğrenciler, görünür ilerleme ve veriye dayalı
          geri bildirim. Bireysel çalışmayı sınıf disipliniyle birleştirin.
        </p>
        <ul>
          <li>
            <strong>Sınıf oluşturma ve kod:</strong> Öğrenciler kod ile katılır; öğretmen panelinden üyelik ve aktivite
            takibi.
          </li>
          <li>
            <strong>Analitik:</strong> Pratik ve modül olaylarından türeyen özetler; hangi konuda sınıfın toplu olarak
            güçlendiğini veya takıldığını görmenize yardımcı olur (uygulama sürümüne göre kapsam değişebilir).
          </li>
          <li>
            <strong>Toplu işlemler:</strong> CSV ile toplu hesap veya içe aktarma gibi kurumsal iş akışları (sürüme göre)
            zaman kazandırır.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-oda",
    title: "Oda (çok oyunculu)",
    body: (
      <>
        <p className="site-info-section-lead">
          Arkadaşınızla veya çalışma grubunuzla aynı sanal odada buluşun. Canlı bağlantı ile birlikte çalışma motivasyonu;
          yarışmadan iş birliğine esnek kullanım.
        </p>
        <ul>
          <li>
            <strong>Oda oluşturma ve katılma:</strong> Kod paylaşımıyla hızlı giriş; menüden erişilen net akış.
          </li>
          <li>
            <strong>Canlı katılımcılar:</strong> Socket.io tabanlı gerçek zamanlı liste; odada kimlerin olduğunu anlık
            görürsünüz.
          </li>
          <li>
            <strong>Oda içi çalışma:</strong> Ortak oturum hissi; bireysel istatistiklerinizle uyumlu şekilde çalışma
            ekranına bağlanır.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-hesap",
    title: "Hesap ve profil",
    body: (
      <>
        <p className="site-info-section-lead">
          Kimliğinizi ve ilerlemenizi görünür kılın: güvenli giriş, özelleştirilebilir profil ve toplulukta tanınabilirlik.
        </p>
        <ul>
          <li>
            <strong>Google ile giriş:</strong> Hızlı ve güvenli oturum; şifre yönetimi yükünü azaltır.
          </li>
          <li>
            <strong>Profil ve avatar:</strong> Takma ad, avatar oluşturucu veya görsel; herkese açık profil ile başkaları
            ilerlemenizi ve rozetlerinizi görebilir (gizlilik tercihlerinize tabi).
          </li>
          <li>
            <strong>Rozetler ve başarılar:</strong> Seri, kelime sayısı, zaman dilimi gibi kilometre taşlarıyla
            görünür ödüllendirme; dashboard ve profille uyumludur.
          </li>
          <li>
            <strong>Çerez ve reklam tercihleri:</strong> Şeffaf onay akışı; premium kullanıcı deneyiminde reklamsız odak
            (uygulama politikasına göre).
          </li>
          <li>
            <strong>Abonelik yönetimi:</strong> Paddle müşteri portalı bağlantısı ile faturalar ve plan değişiklikleri
            (kuruluma bağlı).
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "ozellik-mobil",
    title: "Mobil kullanım ve erişilebilirlik",
    body: (
      <>
        <p className="site-info-section-lead">
          WordBoost, cebinizdeki çalışma arkadaşı olacak şekilde esnek arayüz ve dokunmatik öncelikli düzen sunar. Çentikli
          ekranlardan masaüstüne kadar tutarlı deneyim hedeflenir.
        </p>
        <ul>
          <li>
            <strong>Duyarlı düzen:</strong> Dar genişlikte hamburger menü, kaydırılabilir içerik ve taşmayı önleyen
            tipografi; AI sohbet ve yazım ekranlarında ayrı mobil iyileştirmeler.
          </li>
          <li>
            <strong>Güvenli alan (safe area):</strong> Çentik ve ev göstergesi bölgeleri hesaba katılarak içerik ve
            düğmeler güvenli bölgede tutulur.
          </li>
          <li>
            <strong>Dokunma hedefleri:</strong> Sekme, içindekiler ve kritik düğmeler için yeterli dokunma alanı; yanlış
            dokunuş riski azaltılır.
          </li>
          <li>
            <strong>Klavye ve odak:</strong> Form ve sohbet alanlarında odak görünürlüğü; mümkün olduğunca klavye ile
            kullanıma uyum.
          </li>
        </ul>
      </>
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
        WordBoost; kelime, okuma-yazma ve sınav odaklı İngilizce pratiğini modern bir ürün disipliniyle bir araya getirir.
        Tek hesapta bireysel çalışma, ölçülebilir ilerleme, yapay zekâ destekli üretim ve —isterseniz— sınıf ya da oda ile
        sosyal motivasyon: hepsi aynı çatı altında.
      </p>

      <section className="site-info-block">
        <h2>Wordy — yapay zekâ asistanınız</h2>
        <p>
          Sohbet modunda asistanımızın adı <strong>Wordy</strong>&apos;dir; WordBoost&apos;un maskotu ve dil koçunuzdur.
          Ücretli planda konuşma özetiniz ve uzun bağlam devreye girerek yanıtlar sizin hedeflerinize göre şekillenir.
          Yazım modunda ise deneme, e-posta, paragraf ve iş metinlerinde üretken ve düzenleyici bir ortak sunar — akışlı
          çıktı ile beklemek yerine metni satır satır izlersiniz.
        </p>
      </section>

      <section className="site-info-block">
        <h2>Kimler için?</h2>
        <ul>
          <li>YDT ve benzeri merkezî sınavlara hazırlanan öğrenciler</li>
          <li>Kelime dağarcığını planlı ve ölçülebilir şekilde büyütmek isteyen her seviyeden kullanıcı</li>
          <li>Sınıf veya kurum çapında pratik organize eden öğretmenler (Classroom akışı)</li>
          <li>Çalışma grubu veya arkadaşlarıyla birlikte ilerlemek isteyenler (oda özelliği)</li>
        </ul>
      </section>

      <section className="site-info-block">
        <h2>İletişim</h2>
        <p>
          Paket seçimi, kurumsal lisans veya özel teklif talepleri için:{" "}
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
        Aşağıda WordBoost&apos;un sunduğu deneyimler, ürün dilinde ve ayrıntılı biçimde özetlenmiştir. Üst menü ve
        &quot;Daha fazla&quot; listesinden modüllere tek tıkla geçebilirsiniz; bu sayfa ise yatırımınızın ve zamanınızın
        karşılığında neler aldığınızı şeffafça gösterir. İçindekiler yalnızca sayfa içinde kaydırır — sekme değiştirmez.
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
        Özellik kümesi ve kullanım koşulları zaman içinde gelişebilir; güncel sürüm her zaman canlı uygulamadır. Hukuki
        metinler ve veri işleme ilkeleri için üstteki <strong>Gizlilik</strong> ve <strong>Şartlar</strong> sekmelerine
        başvurunuz.
      </p>
    </article>
  );
}
