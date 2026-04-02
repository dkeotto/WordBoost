import React, { useEffect, useMemo, useState } from "react";
import "./LegalPages.css";
import { isBillingManual } from "../utils/billingMode";
import { readResponseJson } from "../utils/httpJson";
import { apiUrl } from "../utils/apiUrl";
import {
  getSalesEmail,
  mergePlansWithFallback,
  plansForManualMode,
  resolveDisplayPriceForPlan,
} from "../utils/planPresentation";
import PlanContactPanel from "./PlanContactPanel";
import { formatPremiumUntilTr, isUserPremium } from "../utils/premiumDisplay";

function PlanCard({ plan, user, onGoPremium, showCta }) {
  return (
    <article className="pricing-card pricing-card--detailed">
      <div className="pricing-card-head">
        <h2>{plan.label}</h2>
        <p className="pricing-price-line" role="status">
          {resolveDisplayPriceForPlan(plan)}
        </p>
      </div>
      {plan.description ? <p className="pricing-desc">{plan.description}</p> : null}
      {Array.isArray(plan.features) && plan.features.length > 0 ? (
        <ul>
          {plan.features.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      ) : null}
      {showCta && user?.token && typeof onGoPremium === "function" ? (
        <button type="button" className="pricing-cta" onClick={onGoPremium}>
          Satın al / yükselt
        </button>
      ) : null}
      {showCta && !user?.token ? <p className="legal-note">Satın almak veya Paddle ile ödemek için giriş yap.</p> : null}
    </article>
  );
}

/**
 * Paddle doğrulaması ve kullanıcılar için genel fiyatlandırma sayfası.
 * Manuel modda Paddle çağrısı yapılmaz.
 */
export default function PricingPage({ user, onBack, onGoPremium }) {
  const manual = useMemo(() => isBillingManual(), []);
  const salesEmail = useMemo(() => getSalesEmail(), []);
  const [plans, setPlans] = useState([]);
  const [err, setErr] = useState("");
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    if (!user?.token) {
      setBillingStatus(null);
      return;
    }
    setBillingLoading(true);
    fetch(apiUrl("/api/billing/status"), { headers: { Authorization: user.token } })
      .then(async (r) => readResponseJson(r))
      .then((d) => {
        if (d?.ok) {
          setBillingStatus({
            isPremium: Boolean(d.isPremium),
            premiumUntil: d.premiumUntil || null,
            hasAiPlus: Boolean(d.hasAiPlus),
          });
        } else setBillingStatus(null);
      })
      .catch(() => setBillingStatus(null))
      .finally(() => setBillingLoading(false));
  }, [user?.token]);

  useEffect(() => {
    if (manual) return;
    fetch(apiUrl("/api/billing/plans"))
      .then(async (r) => readResponseJson(r))
      .then((d) => {
        if (d?.ok) setPlans(d.items || []);
        else setErr(d?.error || "Planlar yüklenemedi");
      })
      .catch(() => setErr("Planlar yüklenemedi"));
  }, [manual]);

  const displayPlans = useMemo(() => {
    if (manual) return plansForManualMode();
    if (plans.length > 0) return mergePlansWithFallback(plans);
    return plansForManualMode();
  }, [manual, plans]);

  const showPaddleCta = !manual;

  const premiumLive =
    billingStatus != null ? billingStatus.isPremium : isUserPremium(user);
  const premiumUntilLive =
    billingStatus != null ? billingStatus.premiumUntil : user?.premiumUntil || null;
  const aiPlusLive =
    billingStatus != null ? billingStatus.hasAiPlus : Boolean(user?.entitlements?.aiPlus);

  return (
    <div className="legal-page legal-page--pricing">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      {user?.token ? (
        <section
          className={`pricing-account-status ${premiumLive ? "pricing-account-status--premium" : "pricing-account-status--free"}`}
          aria-label="Hesap üyelik durumu"
        >
          {billingLoading && billingStatus == null ? (
            <p className="pricing-account-status__line">Üyelik bilgisi yükleniyor…</p>
          ) : (
            <>
              <p className="pricing-account-status__title">
                {premiumLive ? "Premium üyeliğin aktif" : "Ücretsiz hesap"}
              </p>
              {premiumLive && premiumUntilLive ? (
                <p className="pricing-account-status__line">
                  Bitiş: <strong>{formatPremiumUntilTr(premiumUntilLive)}</strong>
                </p>
              ) : null}
              {premiumLive && !premiumUntilLive ? (
                <p className="pricing-account-status__line">Süresiz veya yönetici atamalı premium.</p>
              ) : null}
              {!premiumLive ? (
                <p className="pricing-account-status__line pricing-account-status__muted">
                  Aşağıdaki paketlerden birini seçerek veya iletişimden yükseltebilirsin.
                </p>
              ) : null}
              {aiPlusLive ? (
                <p className="pricing-account-status__line pricing-account-status--aiplus">
                  <strong>AI+</strong> (tek seferlik) erişimin açık.
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <header className="legal-header">
        <h1>Planlar ve fiyatlandırma</h1>
        <p className="legal-lead">
          {manual ? (
            <>
              WordBoost: kelime pratiği, AI yazım ve sınıf özellikleri. Aşağıda paket özetleri yer alır;{" "}
              <strong>satın alım ve kurumsal teklif için iletişime geçebilirsin.</strong> Premium hesaplar ayrıca
              yönetici tarafından atanabilir.
            </>
          ) : (
            <>
              Paket adı, kısa açıklama ve fiyat bilgisi özet olarak listelenir. Ödeme güvenli şekilde{" "}
              <strong>Paddle</strong> üzerinden yapılabilir; kurumsal veya özel durumlar için iletişim bölümünü kullan.
            </>
          )}
        </p>
      </header>

      <section className="legal-section" aria-labelledby="plans-overview-title">
        <h2 id="plans-overview-title">Paketler</h2>
        <p className="legal-meta">
          Her pakette: <strong>isim</strong>, <strong>açıklama</strong> ve <strong>fiyat / satın alım notu</strong>{" "}
          gösterilir. Sunucudaki <code>PADDLE_PRICE_IDS</code> içinde <code>displayPrice</code> alanı varsa o metin
          önceliklidir.
        </p>
      </section>

      {!manual && err && <p className="legal-note legal-note--warn">{err}</p>}

      {!manual && plans.length === 0 && !err && (
        <p className="legal-note">Planlar yükleniyor…</p>
      )}

      <div className="pricing-grid pricing-grid--spacious">
        {displayPlans.map((p) => (
          <PlanCard
            key={p.tier}
            plan={p}
            user={user}
            onGoPremium={onGoPremium}
            showCta={showPaddleCta}
          />
        ))}
      </div>

      <p className="pricing-packages-email">
        Paketler veya fiyatlar hakkında:{" "}
        <a
          href={`mailto:${salesEmail}?subject=${encodeURIComponent("WordBoost — paket / fiyat sorusu")}`}
        >
          {salesEmail}
        </a>
      </p>

      {!manual && plans.length === 0 && err && (
        <div className="pricing-fallback">
          <p className="legal-note">
            API’den plan gelmedi; yukarıda genel özet paketler gösteriliyor. Sunucuda{" "}
            <code>PADDLE_PRICE_IDS</code> tanımlı olduğunda canlı fiyat metinleri de eklenebilir.
          </p>
        </div>
      )}

      <PlanContactPanel className="pricing-contact-panel--page" />

      <footer className="legal-footer">
        <a href="/terms">Kullanım şartları</a>
        <span aria-hidden> · </span>
        <a href="/privacy">Gizlilik</a>
      </footer>
    </div>
  );
}
