import React, { useEffect, useRef, useState } from "react";
import { getConsentStatus } from "../utils/consentStorage";

function loadAdSense(client) {
  if (!client) return;
  if (typeof window === "undefined") return;
  if (document.querySelector(`script[data-adsense="true"][data-client="${client}"]`)) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  s.crossOrigin = "anonymous";
  s.dataset.adsense = "true";
  s.dataset.client = client;
  document.head.appendChild(s);
}

export default function AdSlot({ slot, format = "auto", style, className, isPremium }) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT;
  const enabled = Boolean(client && slot);

  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  const [consentOk, setConsentOk] = useState(() => getConsentStatus().status === "accepted");

  useEffect(() => {
    const onChange = () => setConsentOk(getConsentStatus().status === "accepted");
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled || isPremium) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setInView(true);
        });
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, isPremium]);

  useEffect(() => {
    if (!enabled || isPremium) return;
    if (!consentOk) return;
    if (!inView) return;
    loadAdSense(client);
    // AdSense render trigger
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // ignore
    }
  }, [enabled, isPremium, consentOk, inView, client]);

  if (!enabled || isPremium) return null;
  if (!consentOk) return null;

  return (
    <div ref={ref} className={className || "ad-slot"} style={style}>
      {inView && (
        <ins
          className="adsbygoogle"
          style={{ display: "block", width: "100%", ...style }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      )}
    </div>
  );
}

