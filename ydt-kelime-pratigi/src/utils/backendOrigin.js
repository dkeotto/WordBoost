/**
 * Frontend (Vercel) ve backend (Railway) ayrı domain’deyken OAuth ve API için kök URL.
 * VITE_BACKEND_URL veya VITE_SOCKET_URL (aynı Express sunucusu) kullanılır.
 */
export function getBackendOrigin() {
  const raw = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_SOCKET_URL;
  if (!raw || !String(raw).trim()) return "";
  return String(raw).trim().replace(/\/$/, "");
}

/**
 * Google OAuth başlatma.
 * Production + Vercel: aynı origin üzerinden /api/auth/* → proxy ile Railway; Google “uygulama” olarak ana domaini gösterir.
 * Geliştirme: VITE_* ile doğrudan backend /auth/google.
 */
export function getGoogleAuthUrl() {
  if (import.meta.env.PROD && typeof window !== "undefined") {
    return `${window.location.origin}/api/auth/google`;
  }
  const origin = getBackendOrigin();
  if (origin) return `${origin}/auth/google`;
  return "/auth/google";
}
