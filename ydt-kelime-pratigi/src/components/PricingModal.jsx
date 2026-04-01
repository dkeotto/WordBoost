import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { isBillingManual } from "../utils/billingMode";

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

  const selected = useMemo(() => plans.find((p) => p.tier === tier) || null, [plans, tier]);

  useEffect(() => {
    if (manual) {
      setLoading(false);
      return;
    }
    setErr("");
    setLoading(true);
    fetch("/api/billing/plans")
      .then((r) => r.json())
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
      const res = await fetch("/api/billing/paddle/portal-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ tier, quantity }),
      });
      const d = await res.json();
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
            <p>
              <strong>Manuel premium:</strong> Giriş yaptıktan sonra hesabın için premium veya AI+ tanımlanması gerekiyorsa
              uygulama yöneticisiyle iletişime geç. Yönetici, admin panelinden hesabına süre ve yetki atayabilir.
            </p>
            {!token ? <p className="pricing-desc">Satın alma / talep için önce giriş yap.</p> : null}
            <div className="pricing-actions">
              <button type="button" className="pricing-btn pricing-btn--primary" onClick={onClose}>
                Tamam
              </button>
            </div>
          </div>
        )}

        {!manual && loading && plans.length === 0 && <div className="pricing-loading">Planlar yükleniyor…</div>}
        {!manual && err && <div className="pricing-error-banner">{err}</div>}

        {!manual && plans.length > 0 && (
          <>
            <div className="pricing-grid">
              {plans.map((p) => (
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
              ))}
            </div>

            {selected?.allowQuantity ? (
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

            <div className="pricing-actions">
              <button type="button" className="pricing-btn pricing-btn--ghost" onClick={onClose} disabled={loading}>
                Vazgeç
              </button>
              <button type="button" className="pricing-btn pricing-btn--primary" onClick={goCheckout} disabled={loading || !tier}>
                {loading ? "Yönlendiriliyor…" : "Paddle ile satın al"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

