const KEY = "wb_cookie_consent_v1"; // { status: 'accepted'|'rejected', ts }

/** CustomEvent yanında doğrudan callback — bazı tarayıcı/ortamlarda olay güvenilir değil */
const openSubscribers = new Set();

export function subscribeConsentDialogOpen(fn) {
  if (typeof fn !== "function") return () => {};
  openSubscribers.add(fn);
  return () => openSubscribers.delete(fn);
}

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

/** Navbar / dashboard’dan çerez panelini açmak için */
export function openConsentDialog() {
  openSubscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
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

