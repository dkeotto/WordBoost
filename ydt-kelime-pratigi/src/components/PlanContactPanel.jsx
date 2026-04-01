import React from "react";
import { getSalesEmail } from "../utils/planPresentation";

/**
 * Satın alım / kurumsal teklif için iletişim kutusu (fiyatlandırma sayfası + modal).
 */
export default function PlanContactPanel({ className = "" }) {
  const email = getSalesEmail();

  return (
    <section
      className={`pricing-contact-panel ${className}`.trim()}
      aria-labelledby="plan-contact-title"
    >
      <h3 id="plan-contact-title">Satın alım için iletişim</h3>
      <p>
        Ödeme linki dışında kurumsal teklif, fatura (e-Fatura), okul / sınıf lisansı veya toplu hesap
        oluşturma ihtiyaçların için bizimle iletişime geçebilirsin.
      </p>
      {email ? (
        <p className="pricing-contact-email">
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("WordBoost satın alım / teklif")}`}
          >
            {email}
          </a>
        </p>
      ) : import.meta.env.DEV ? (
        <p className="pricing-contact-muted">
          Yerelde göstermek için <code>VITE_SALES_EMAIL</code> tanımla (ör. .env).
        </p>
      ) : (
        <p className="pricing-contact-muted">WordBoost ekibiyle iletişime geçerek teklif alabilirsin.</p>
      )}
    </section>
  );
}
