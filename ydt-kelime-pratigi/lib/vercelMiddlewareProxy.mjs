/**
 * Vercel Routing Middleware (Node runtime): /api/* → BACKEND_URL (Railway).
 * api/[...path].js bazen yanlış Root Directory veya statik çıktı ile deploy’da 404 veriyor;
 * middleware her zaman /api yolunu yakalar.
 */
export async function proxyApiToBackend(request) {
  const backend = process.env.BACKEND_URL;
  if (!backend || !String(backend).trim()) {
    return new Response(
      JSON.stringify({ error: "BACKEND_URL is not set in Vercel environment variables." }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  let base;
  try {
    const raw = String(backend).trim().replace(/\/$/, "");
    base = new URL(raw);
  } catch {
    return new Response(JSON.stringify({ error: "BACKEND_URL is not a valid URL." }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const src = new URL(request.url);
  let pathname = src.pathname;
  if (pathname.startsWith("/api/auth")) {
    pathname = pathname.replace(/^\/api\/auth/, "/auth") || "/";
  }
  const target = new URL(pathname + src.search, base);

  const headers = new Headers(request.headers);
  const fwdHost = request.headers.get("x-forwarded-host") || src.host;
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  headers.set("x-forwarded-host", fwdHost);
  headers.set("x-forwarded-proto", fwdProto);
  headers.set("host", target.host);
  headers.delete("connection");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD" && request.body) {
    init.body = request.body;
    init.duplex = "half";
  }

  let res;
  try {
    res = await fetch(target, init);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Backend unreachable", detail: String(e?.message || e) }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const out = new Headers(res.headers);
  out.delete("connection");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}
