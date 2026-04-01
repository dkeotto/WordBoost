/**
 * Vercel Serverless: /api/* isteklerini BACKEND_URL (Railway vb.) üzerindeki Express’e iletir.
 * Ortam: Vercel → Project → Environment Variables → BACKEND_URL=https://xxx.railway.app
 */
import http from "node:http";
import https from "node:https";

export default function vercelApiProxy(req, res) {
  const backend = process.env.BACKEND_URL;
  if (!backend) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "BACKEND_URL is not set in Vercel environment variables." }));
    return;
  }

  let base;
  try {
    base = new URL(backend.endsWith("/") ? backend.slice(0, -1) : backend);
  } catch {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "BACKEND_URL is not a valid URL." }));
    return;
  }

  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  const pathAndQuery = incoming.pathname + incoming.search;
  const target = new URL(pathAndQuery, base);

  const isHttps = target.protocol === "https:";
  const lib = isHttps ? https : http;

  const headers = { ...req.headers };
  headers.host = target.host;
  delete headers.connection;

  const opts = {
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: target.pathname + target.search,
    method: req.method,
    headers,
  };

  const proxyReq = lib.request(opts, (proxyRes) => {
    const outHeaders = { ...proxyRes.headers };
    delete outHeaders.connection;
    res.writeHead(proxyRes.statusCode || 502, outHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Backend unreachable", detail: String(err.message) }));
    }
  });

  req.pipe(proxyReq);
}
