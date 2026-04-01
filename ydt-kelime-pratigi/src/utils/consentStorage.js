const KEY = "wb_cookie_consent_v1"; // { status: 'accepted'|'rejected', ts }

export function getConsentStatus() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { status: "unknown" };
    const parsed = JSON.parse(raw);
    if (parsed?.status === "accepted") return { status: "accepted" };
    if (parsed?.status === "rejected") return { status: "rejected" };
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}

export function setConsentStatus(status) {
  localStorage.setItem(KEY, JSON.stringify({ status, ts: Date.now() }));
  window.dispatchEvent(new CustomEvent("wb_consent_change", { detail: { status } }));
}

/** Navbar / dashboard’dan çerez panelini açmak için — window + document (bazı ortamlarda tek hedef yetmez) */
export function openConsentDialog() {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("wb_consent_open", { bubbles: true }));
    }
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("wb_consent_open", { bubbles: true }));
    }
  } catch {
    /* ignore */
  }
}

