/**
 * Vercel Root Directory = ydt-kelime iken /api/* proxy (pratigi altındaki ortak mantık).
 */
import { proxyApiToBackend } from "./ydt-kelime-pratigi/lib/vercelMiddlewareProxy.mjs";

export const config = {
  matcher: "/api/:path*",
  runtime: "nodejs",
};

export default async function middleware(request) {
  return proxyApiToBackend(request);
}
