/**
 * Vercel: Root Directory = bu klasörün üstü (ydt-kelime-pratigi) iken kullanılır.
 * Gerçek proxy mantığı lib/vercelApiProxy.mjs içinde (monorepo kökü api/ ile paylaşılır).
 */
export { default } from "../lib/vercelApiProxy.mjs";
