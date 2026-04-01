import { getBackendOrigin } from "./backendOrigin";

/**
 * API path’i tam URL’ye çevirir.
 * Production’da VITE_SOCKET_URL / VITE_BACKEND_URL varsa REST, profil, liderlik ve SSE/AI stream
 * doğrudan Railway’e gider (Vercel’de /api proxy 404 verdiğinde yedek yol).
 */
export function apiUrl(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env.DEV) return p;
  const origin = getBackendOrigin();
  if (origin) return `${origin.replace(/\/$/, "")}${p}`;
  return p;
}
