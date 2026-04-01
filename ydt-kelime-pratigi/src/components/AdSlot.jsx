import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getConsentStatus } from "../utils/consentStorage";
import { pushAdSlot } from "../utils/adsenseLoader";

export default function AdSlot({ slot, format = "auto", style, className, isPremium }) {
  const client = (import.meta.env.VITE_ADSENSE_CLIENT || "").trim();
  const slotStr = slot != null ? String(slot).trim() : "";
  const enabled = Boolean(client && slotStr);

  const [inView, setInView] = useState(false);
  const ref = useRef(null);
  const insRef = useRef(null);
  const pushedRef = useRef(false);

  const [consent, setConsent] = useState(() => getConsentStatus().status);

  const adsAllowed = consent !== "rejected";
  const nonPersonalized = consent === "unknown";

  useLayoutEffect(() => {
    pushedRef.current = false;
  }, [slotStr, consent]);

  useEffect(() => {
    const onChange = () => setConsent(getConsentStatus().status);
    window.addEventListener("wb_consent_change", onChange);
    return () => window.removeEventListener("wb_consent_change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled || isPremium || !adsAllowed) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setInView(true);
        });
      },
      { rootMargin: "240px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, isPremium, adsAllowed]);

  useLayoutEffect(() => {
    if (!enabled || isPremium || !adsAllowed || !inView) return;
    const el = insRef.current;
    if (!el || pushedRef.current) return;
    let cancelled = false;
    pushAdSlot(client, el).then(() => {
      if (!cancelled) pushedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isPremium, adsAllowed, inView, client, slotStr, consent]);

  if (!enabled || isPremium) return null;
  if (!adsAllowed) return null;

  return (
    <div ref={ref} className={className || "ad-slot"} style={style}>
      <ins
        key={`${slotStr}-${consent}`}
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", width: "100%", ...style }}
        data-ad-client={client}
        data-ad-slot={slotStr}
        data-ad-format={format}
        data-full-width-responsive="true"
        data-npa={nonPersonalized ? "1" : undefined}
      />
    </div>
  );
}
