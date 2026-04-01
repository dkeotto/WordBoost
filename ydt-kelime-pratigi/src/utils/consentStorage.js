const KEY = "wb_cookie_consent_v1"; // { status: 'accepted'|'rejected', ts }

/** CustomEvent yanında doğrudan callback — bazı tarayıcı/ortamlarda olay güvenilir değil */
const openSubscribers = new Set();
/** Abone yokken (ör. splash sırası) gelen aç isteği — mount olunca bir kez uygulanır */
let pendingConsentOpen = false;

export function subscribeConsentDialogOpen(fn) {
  if (typeof fn !== "function") return () => {};
  openSubscribers.add(fn);
  if (pendingConsentOpen) {
    pendingConsentOpen = false;
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  return () => openSubscribers.delete(fn);
}

export function getConsentStatus() {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) raw = sessionStorage.getItem(KEY);
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
  const payload = JSON.stringify({ status, ts: Date.now() });
  try {
    localStorage.setItem(KEY, payload);
  } catch {
    try {
      sessionStorage.setItem(KEY, payload);
    } catch {
      /* depolama kapalıysa yine de arayüzü güncelle */
    }
  }
  window.dispatchEvent(new CustomEvent("wb_consent_change", { detail: { status } }));
}

/** Navbar / dashboard’dan çerez panelini açmak için */
export function openConsentDialog() {
  if (openSubscribers.size === 0) {
    pendingConsentOpen = true;
  } else {
    openSubscribers.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
  }
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

