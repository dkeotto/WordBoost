import React, { useEffect, useState } from "react";
import { getConsentStatus, setConsentStatus } from "../utils/consentStorage";

export default function ConsentBanner() {
  const [status, setStatus] = useState(() => getConsentStatus().status);
  const [isOpen, setIsOpen] = useState(() => status === "unknown");

  useEffect(() => {
    const onChange = () => {
      const s = getConsentStatus().status;
      setStatus(s);
      setIsOpen(s === "unknown");
    };
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="consent-banner" role="region" aria-label="Cookie consent">
      <div className="consent-inner">
        <div className="consent-text">
          <strong>Çerez tercihi</strong>
          <p>
            Bu uygulama, reklam ve temel ölçümleme için çerez kullanabilir. İstersen reddedebilir veya kabul edebilirsin.
          </p>
        </div>
        <div className="consent-actions">
          <button
            className="consent-btn secondary"
            type="button"
            onClick={() => {
              setConsentStatus("rejected");
              setStatus("rejected");
              setIsOpen(false);
            }}
          >
            Reddet
          </button>
          <button
            className="consent-btn"
            type="button"
            onClick={() => {
              setConsentStatus("accepted");
              setStatus("accepted");
              setIsOpen(false);
            }}
          >
            Kabul et
          </button>
        </div>
      </div>
    </div>
  );
}

