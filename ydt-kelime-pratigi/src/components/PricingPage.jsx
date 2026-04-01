import React, { useEffect, useState } from "react";
import "./LegalPages.css";

/**
 * Paddle doğrulaması ve kullanıcılar için genel fiyatlandırma sayfası.
 * Gerçek ödeme tutarları Paddle panelindeki price’lara göre değişir.
 */
export default function PricingPage({ user, onBack, onGoPremium }) {
  const [plans, setPlans] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setPlans(d.items || []);
        else setErr(d?.error || "Planlar yüklenemedi");
      })
      .catch(() => setErr("Planlar yüklenemedi"));
  }, []);

  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Uygulamaya dön
      </button>

      <header className="legal-header">
        <h1>Fiyatlandırma</h1>
        <p className="legal-lead">
          YDT Kelime Pratiği: kelime öğrenme, AI yazım asistanı ve sınıf özellikleri. Ödeme güvenli şekilde{" "}
          <strong>Paddle</strong> üzerinden alınır.
        </p>
      </header>

      {err && <p className="legal-note legal-note--warn">{err}</p>}

      <div className="pricing-grid">
        {plans.length === 0 && !err && (
          <p className="legal-note">Planlar yükleniyor… Sunucuda <code>PADDLE_PRICE_IDS</code> tanımlı olmalı.</p>
        )}
        {plans.map((p) => (
          <article key={p.tier} className="pricing-card">
            <h2>{p.label || p.tier}</h2>
            {p.description ? <p className="pricing-desc">{p.description}</p> : null}
            {Array.isArray(p.features) && p.features.length > 0 ? (
              <ul>
                {p.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : (
              <ul>
                <li>Premium özellikler</li>
              </ul>
            )}
            {user?.token && typeof onGoPremium === "function" ? (
              <button type="button" className="pricing-cta" onClick={onGoPremium}>
                Satın al / yükselt
              </button>
            ) : (
              <p className="legal-note">Satın almak için giriş yap.</p>
            )}
          </article>
        ))}
      </div>

      {plans.length === 0 && err && (
        <div className="pricing-fallback">
          <h2>Örnek paketler</h2>
          <ul>
            <li>
              <strong>Premium</strong> — AI Writing Mode (sınırsız kullanım), reklamsız deneyim
            </li>
            <li>
              <strong>School / Teacher</strong> — Sınıf yönetimi, toplu öğrenci, analitik (Paddle’da ayrı price)
            </li>
          </ul>
        </div>
      )}

      <footer className="legal-footer">
        <a href="/terms">Kullanım şartları</a>
        <span aria-hidden> · </span>
        <a href="/privacy">Gizlilik</a>
      </footer>
    </div>
  );
}
