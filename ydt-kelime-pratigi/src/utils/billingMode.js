/**
 * Paddle checkout yerine manuel premium (admin panel) kullanımı.
 * - VITE_BILLING_MODE=manual → her zaman manuel
 * - VITE_BILLING_MODE=paddle → Paddle UI (token gerekir)
 * - Aksi halde VITE_PADDLE_CLIENT_TOKEN yoksa manuel sayılır
 */
export function isBillingManual() {
  const mode = String(import.meta.env.VITE_BILLING_MODE || "").trim().toLowerCase();
  if (mode === "manual" || mode === "true") return true;
  if (mode === "paddle") return false;
  return !String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || "").trim();
}
