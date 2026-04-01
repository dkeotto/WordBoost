import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { isBillingManual } from "../utils/billingMode";
import { readResponseJson } from "../utils/httpJson";
import { apiUrl } from "../utils/apiUrl";
import { mergePlansWithFallback, plansForManualMode } from "../utils/planPresentation";
import PlanContactPanel from "./PlanContactPanel";
import "./LegalPages.css";

function humanizeCheckoutError(msg) {
  const s = String(msg || "");
  if (/checkout has not yet been enabled/i.test(s) || /onboarding process has completed/i.test(s)) {
    return "Paddle hesabında canlı ödeme henüz açılmamış. Paddle panelinde onboarding’i tamamla veya sandbox ile test et (PADDLE_ENV=sandbox).";
  }
  return s;
}

export default function PricingModal({ user, onClose }) {
  const token = user?.token || "";
  const manual = useMemo(() => isBillingManual(), []);
  const [plans, setPlans] = useState([]);
  const [tier, setTier] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const paddleMerged = useMemo(() => mergePlansWithFallback(plans), [plans]);
  const fallbackList = useMemo(() => plansForManualMode(), []);
  const canPaddleCheckout = !manual && plans.length > 0;

  const displayPlans = useMemo(() => {
    if (manual) return fallbackList;
    if (plans.length > 0) return paddleMerged;
    if (!loading && err) return fallbackList;
    return [];
  }, [manual, plans.length, paddleMerged, fallbackList, loading, err]);

  const selected = useMemo(
    () => (canPaddleCheckout ? paddleMerged.find((p) => p.tier === tier) : null) || null,
    [canPaddleCheckout, paddleMerged, tier]
  );

  useEffect(() => {
    if (manual) {
      setLoading(false);
      return;
    }
    setErr("");
    setLoading(true);
    fetch(apiUrl("/api/billing/plans"))
      .then(async (r) => readResponseJson(r))
      .then((d) => {
        if (!d?.ok) throw new Error(d?.error || "Planlar yüklenemedi");
        setPlans(d.items || []);
        const firstTier = d.items?.[0]?.tier || "";
        setTier(firstTier);
      })
      .catch((e) => setErr(humanizeCheckoutError(e.message) || "Hata"))
      .finally(() => setLoading(false));
  }, [manual]);

  useEffect(() => {
    if (!selected) return;
    setQuantity(Math.max(1, Number(selected.defaultQuantity || 1)));
  }, [selected]);

  useEffect(() => {
    if (!canPaddleCheckout || paddleMerged.length === 0) return;
    if (!tier || !paddleMerged.some((p) => p.tier === tier)) {
      setTier(paddleMerged[0].tier);
    }
  }, [canPaddleCheckout, paddleMerged, tier]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const goCheckout = async () => {
    if (manual) return;
    if (!token) {
      setErr("Satın alma için giriş gerekli.");
      return;
    }
    if (!tier) return;
    setErr("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/billing/paddle/portal-link"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ tier, quantity }),
      });
      const d = await readResponseJson(res);
      if (!res.ok) {
        if (d?.error === "email_required") {
          throw new Error("Satın alma için e-posta gerekli. Profilinden e-posta ekleyip tekrar dene.");
        }
        throw new Error(d?.error || "Checkout oluşturulamadı");
      }
      if (!d?.url) throw new Error("Checkout URL alınamadı");
      window.location.href = d.url;
    } catch (e) {
      setErr(humanizeCheckoutError(e.message) || "Hata");
    } finally {
      setLoading(false);
    }
  };

  const modal = (
    <div className="pricing-overlay" role="presentation" onClick={onClose}>
      <div
        className="pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pricing-header">
          <div>
            <h3 id="pricing-modal-title">{manual ? "Premium" : "Plan seç"}</h3>
            <p className="pricing-subtitle">
              {manual
                ? "Ödeme sağlayıcısı kullanılmıyor; premium hesaplar yönetici tarafından atanır."
                : "WordBoost paketleri — güvenli ödeme Paddle üzerinden"}
            </p>
          </div>
          <button type="button" className="pricing-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {manual && (
          <div className="pricing-manual-box">
            <p className="pricing-subtitle" style={{ marginBottom: "0.75rem" }}>
              Ödeme sağlayıcısı kapalı. Paket özetleri aşağıda; <strong>satın alım için iletişim</strong> kutusunu kullan
              veya yöneticiden premium ataması iste.
            </p>
            <div className="pricing-grid pricing-grid--manual">
              {displayPlans.map((p) => (
                <div key={p.tier} className="pricing-card pricing-card--readonly">
                  <div className="pricing-title">{p.label}</div>
                  {p.displayPrice ? <div className="pricing-price-tag">{p.displayPrice}</div> : null}
                  {p.description ? <div className="pricing-desc">{p.description}</div> : null}
                  {Array.isArray(p.features) && p.features.length > 0 ? (
                    <ul className="pricing-features">
                      {p.features.slice(0, 6).map((f, i) => (
                        <li key={`${p.tier}-m-${i}`}>{String(f)}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            {!token ? <p className="pricing-desc">Paddle ile ödeme açıksa satın almak için giriş gerekir.</p> : null}
            <PlanContactPanel />
            <div className="pricing-actions">
              <button type="button" className="pricing-btn pricing-btn--primary" onClick={onClose}>
                Tamam
              </button>
            </div>
          </div>
        )}

        {!manual && loading && plans.length === 0 && <div className="pricing-loading">Planlar yükleniyor…</div>}
        {!manual && err && <div className="pricing-error-banner">{err}</div>}

        {!manual && displayPlans.length > 0 && (
          <>
            <div className="pricing-grid">
              {displayPlans.map((p) =>
                canPaddleCheckout ? (
                  <button
                    key={p.tier}
                    type="button"
                    className={`pricing-card ${tier === p.tier ? "active" : ""} ${
                      p.tier === "premium" ? "pricing-card--featured" : ""
                    } ${p.tier === "aiPlus" ? "pricing-card--ai" : ""} ${p.tier === "classroom" ? "pricing-card--school" : ""}`}
                    onClick={() => setTier(p.tier)}
                    disabled={loading}
                  >
                    {p.tier === "aiPlus" ? <span className="pricing-tag pricing-tag--once">Tek sefer</span> : null}
                    {p.tier === "classroom" ? <span className="pricing-tag pricing-tag--team">Okul / sınıf</span> : null}
                    {p.tier === "premium" ? <span className="pricing-ribbon-badge">En popüler</span> : null}
                    <div className="pricing-title">{p.label || p.tier}</div>
                    {p.displayPrice ? <div className="pricing-price-tag">{p.displayPrice}</div> : null}
                    {p.description ? <div className="pricing-desc">{p.description}</div> : null}
                    {Array.isArray(p.features) && p.features.length > 0 ? (
                      <ul className="pricing-features">
                        {p.features.slice(0, 8).map((f, i) => (
                          <li key={`${p.tier}-${i}`}>{String(f)}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="pricing-desc pricing-desc--muted">—</div>
                    )}
                  </button>
                ) : (
                  <div
                    key={p.tier}
                    className={`pricing-card pricing-card--readonly ${
                      p.tier === "premium" ? "pricing-card--featured" : ""
                    } ${p.tier === "aiPlus" ? "pricing-card--ai" : ""} ${p.tier === "classroom" ? "pricing-card--school" : ""}`}
                  >
                    {p.tier === "aiPlus" ? <span className="pricing-tag pricing-tag--once">Tek sefer</span> : null}
                    {p.tier === "classroom" ? <span className="pricing-tag pricing-tag--team">Okul / sınıf</span> : null}
                    {p.tier === "premium" ? <span className="pricing-ribbon-badge">En popüler</span> : null}
                    <div className="pricing-title">{p.label || p.tier}</div>
                    {p.displayPrice ? <div className="pricing-price-tag">{p.displayPrice}</div> : null}
                    {p.description ? <div className="pricing-desc">{p.description}</div> : null}
                    {Array.isArray(p.features) && p.features.length > 0 ? (
                      <ul className="pricing-features">
                        {p.features.slice(0, 8).map((f, i) => (
                          <li key={`${p.tier}-fb-${i}`}>{String(f)}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )
              )}
            </div>

            {canPaddleCheckout && selected?.allowQuantity ? (
              <div className="pricing-row">
                <label className="pricing-qty-label">
                  Öğrenci / lisans adedi
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                  />
                </label>
              </div>
            ) : null}

            <PlanContactPanel />

            <div className="pricing-actions">
              <button type="button" className="pricing-btn pricing-btn--ghost" onClick={onClose} disabled={loading}>
                Vazgeç
              </button>
              {canPaddleCheckout ? (
                <button
                  type="button"
                  className="pricing-btn pricing-btn--primary"
                  onClick={goCheckout}
                  disabled={loading || !tier}
                >
                  {loading ? "Yönlendiriliyor…" : "Paddle ile satın al"}
                </button>
              ) : (
                <p className="pricing-checkout-fallback-msg">
                  Canlı planlar yüklenemedi; satın alım için yukarıdaki iletişim bölümünü kullan.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

