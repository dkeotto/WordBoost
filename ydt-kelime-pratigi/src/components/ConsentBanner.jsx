import React, { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getConsentStatus, setConsentStatus, subscribeConsentDialogOpen } from "../utils/consentStorage";

export default function ConsentBanner() {
  const [status, setStatus] = useState(() => getConsentStatus().status);
  const [isOpen, setIsOpen] = useState(() => getConsentStatus().status === "unknown");
  /** Navbar’dan “çerez aç” ile hemen göster; ilk girişte kısa gecikme + hafif animasyon */
  const [instantReveal, setInstantReveal] = useState(false);

  useEffect(() => {
    const onChange = () => {
      const s = getConsentStatus().status;
      setStatus(s);
      setIsOpen(s === "unknown");
      setInstantReveal(false);
    };
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  useLayoutEffect(() => {
    const onOpen = () => {
      setInstantReveal(true);
      setIsOpen(true);
    };
    const unsub = subscribeConsentDialogOpen(onOpen);
    window.addEventListener("wb_consent_open", onOpen);
    document.addEventListener("wb_consent_open", onOpen);
    return () => {
      unsub();
      window.removeEventListener("wb_consent_open", onOpen);
      document.removeEventListener("wb_consent_open", onOpen);
    };
  }, []);

  if (!isOpen) return null;

  const banner = (
    <div
      className={`consent-banner ${instantReveal ? "consent-banner--now consent-banner--forced" : "consent-banner--delayed"}`}
      role="region"
      aria-label="Çerez bildirimi"
    >
      <div className="consent-inner">
        <p className="consent-text">
          <span className="consent-cookie" aria-hidden>
            🍪
          </span>
          Deneyimi ve reklamları iyileştirmek için çerez kullanıyoruz. İstediğin zaman ayarlardan değiştirebilirsin.
        </p>
        <div className="consent-actions">
          <button
            className="consent-btn consent-btn--primary"
            type="button"
            onClick={() => {
              setConsentStatus("accepted");
              setStatus("accepted");
              setIsOpen(false);
              setInstantReveal(false);
            }}
          >
            Kabul et
          </button>
          <button
            className="consent-btn consent-btn--ghost"
            type="button"
            onClick={() => {
              setConsentStatus("rejected");
              setStatus("rejected");
              setIsOpen(false);
              setInstantReveal(false);
            }}
          >
            Reddet
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(banner, document.body);
}

