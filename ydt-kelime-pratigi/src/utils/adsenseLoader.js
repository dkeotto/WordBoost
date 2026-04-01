/**
 * Tekil AdSense script + sıralı push: birden fazla <ins> aynı anda push({}) ile yarışmayıp
 * TagError / boş slot riskini azaltır.
 */
function findExistingScript(client) {
  if (typeof document === "undefined") return null;
  const enc = encodeURIComponent(client);
  const scripts = [...document.querySelectorAll("script[src*='pagead2.googlesyndication.com/pagead/js/adsbygoogle.js']")];
  return (
    scripts.find((s) => s.src.includes(enc) || s.src.includes(client)) ||
    [...document.querySelectorAll("script[data-adsense='true']")].find((n) => n.dataset.client === client) ||
    null
  );
}

export function ensureAdSenseScript(client) {
  return new Promise((resolve) => {
    if (!client || typeof window === "undefined") {
      resolve();
      return;
    }
    const existing = findExistingScript(client);
    if (existing) {
      if (window.adsbygoogle && typeof window.adsbygoogle.push === "function") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      return;
    }
    window.adsbygoogle = window.adsbygoogle || [];
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    s.dataset.adsense = "true";
    s.dataset.client = client;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

let pushChain = Promise.resolve();

/**
 * @param {string} client
 * @param {HTMLElement | null} insElement
 */
function waitNextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

export function pushAdSlot(client, insElement) {
  if (!insElement) return pushChain;
  pushChain = pushChain.then(async () => {
    await ensureAdSenseScript(client);
    if (!insElement.isConnected) return;
    await waitNextPaint();
    window.adsbygoogle = window.adsbygoogle || [];
    try {
      window.adsbygoogle.pauseAdRequests = 0;
    } catch {
      /* ignore */
    }
    /* element: hangi <ins> doldurulacak — yalnız push({}) görünür slot ile DOM sırası uyuşmayınca yan panel beyaz kalıyordu */
    try {
      window.adsbygoogle.push({ element: insElement });
    } catch {
      try {
        window.adsbygoogle.push({});
      } catch {
        /* ignore */
      }
    }
  });
  return pushChain;
}
