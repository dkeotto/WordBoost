import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getConsentStatus } from "../utils/consentStorage";

function loadAdSense(client) {
  return new Promise((resolve) => {
    if (!client || typeof window === "undefined") {
      resolve();
      return;
    }
    const existing = [...document.querySelectorAll("script[data-adsense='true']")].find(
      (n) => n.dataset.client === client
    );
    if (existing) {
      if (window.adsbygoogle) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.crossOrigin = "anonymous";
    s.dataset.adsense = "true";
    s.dataset.client = client;
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

export default function AdSlot({ slot, format = "auto", style, className, isPremium }) {
  const client = import.meta.env.VITE_ADSENSE_CLIENT;
  const enabled = Boolean(client && slot);

  const [inView, setInView] = useState(false);
  const ref = useRef(null);
  const pushedRef = useRef(false);

  const [consentOk, setConsentOk] = useState(() => getConsentStatus().status === "accepted");

  useLayoutEffect(() => {
    pushedRef.current = false;
  }, [slot]);

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

  useLayoutEffect(() => {
    if (!enabled || isPremium || !consentOk || !inView) return;
    if (pushedRef.current) return;
    let cancelled = false;
    loadAdSense(client).then(() => {
      if (cancelled || pushedRef.current) return;
      try {
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        pushedRef.current = true;
      } catch {
        pushedRef.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isPremium, consentOk, inView, client, slot]);

  if (!enabled || isPremium) return null;
  if (!consentOk) return null;

  return (
    <div ref={ref} className={className || "ad-slot"} style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", ...style }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}

