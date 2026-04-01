import { proxyApiToBackend } from "./lib/vercelMiddlewareProxy.mjs";

export const config = {
  matcher: "/api/:path*",
  runtime: "nodejs",
};

export default async function middleware(request) {
  return proxyApiToBackend(request);
}
