import React, { useEffect, useMemo, useState } from "react";

export default function PricingModal({ user, onClose }) {
  const token = user?.token || "";
  const [plans, setPlans] = useState([]);
  const [tier, setTier] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const selected = useMemo(() => plans.find((p) => p.tier === tier) || null, [plans, tier]);

  useEffect(() => {
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
      .catch((e) => setErr(e.message || "Hata"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setQuantity(Math.max(1, Number(selected.defaultQuantity || 1)));
  }, [selected]);

  const goCheckout = async () => {
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
      setErr(e.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pricing-overlay" onClick={onClose}>
      <div className="pricing-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pricing-header">
          <h3>Plan seç</h3>
          <button type="button" className="pricing-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && plans.length === 0 && <div className="empty-state">Yükleniyor…</div>}
        {err && <div className="ai-error">{err}</div>}

        {plans.length > 0 && (
          <>
            <div className="pricing-grid">
              {plans.map((p) => (
                <button
                  key={p.tier}
                  type="button"
                  className={`pricing-card ${tier === p.tier ? "active" : ""}`}
                  onClick={() => setTier(p.tier)}
                  disabled={loading}
                >
                  <div className="pricing-title">{p.label || p.tier}</div>
                  {p.description ? <div className="pricing-desc">{p.description}</div> : null}
                  {Array.isArray(p.features) && p.features.length > 0 ? (
                    <ul className="pricing-features">
                      {p.features.slice(0, 6).map((f, i) => (
                        <li key={`${p.tier}-${i}`}>{String(f)}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="pricing-desc">—</div>
                  )}
                </button>
              ))}
            </div>

            {selected?.allowQuantity ? (
              <div className="pricing-row">
                <label>
                  Adet
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
              <button type="button" className="ai-secondary" onClick={onClose} disabled={loading}>
                Vazgeç
              </button>
              <button type="button" onClick={goCheckout} disabled={loading || !tier}>
                {loading ? "Yönlendiriliyor…" : "Paddle ile satın al"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

