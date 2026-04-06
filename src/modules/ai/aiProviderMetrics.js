/**
 * Bellek içi AI sağlayıcı metrikleri (admin paneli + failover sırası).
 * Çoklu process / pod ortamında her örnek kendi belleğini görür.
 */

const legs = new Map();

const globalState = {
  lastRequest: null,
  configuredLegs: [],
  failoverPrimary: "groq",
  runtimeName: "",
};

function ensureLeg(id) {
  const k = String(id || "unknown");
  if (!legs.has(k)) {
    legs.set(k, {
      id: k,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      rateLimitedUntil: 0,
      requestsOk: 0,
      limitRemaining: null,
      limitReset: null,
    });
  }
  return legs.get(k);
}

function readHeader(headers, name) {
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get(name) || headers.get(name.toLowerCase()) || null;
}

function parseRetryAfterMs(err) {
  const h = err?.headers;
  const raw = readHeader(h, "retry-after");
  if (!raw) return null;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n * 1000;
}

function recordSuccess(id, headers) {
  const s = ensureLeg(id);
  const now = Date.now();
  s.lastSuccessAt = now;
  s.requestsOk += 1;
  s.rateLimitedUntil = 0;
  const rem =
    readHeader(headers, "x-ratelimit-remaining-requests") ||
    readHeader(headers, "x-ratelimit-remaining") ||
    readHeader(headers, "x-ratelimit-remaining-tokens");
  const reset =
    readHeader(headers, "x-ratelimit-reset-requests") ||
    readHeader(headers, "x-ratelimit-reset") ||
    readHeader(headers, "x-ratelimit-reset-tokens");
  if (rem != null && rem !== "") s.limitRemaining = String(rem);
  if (reset != null && reset !== "") s.limitReset = String(reset);
  globalState.lastRequest = { provider: id, at: now };
}

function recordError(id, err, opts = {}) {
  const s = ensureLeg(id);
  s.lastErrorAt = Date.now();
  s.lastErrorMessage = String(err?.message || opts.fallback || "error").slice(0, 280);
}

function recordRateLimit(id, err) {
  const s = ensureLeg(id);
  const now = Date.now();
  s.lastErrorAt = now;
  s.lastErrorMessage = String(err?.message || "rate_limit").slice(0, 280);
  const retryMs = parseRetryAfterMs(err);
  const until = retryMs != null ? now + retryMs : now + 90_000;
  s.rateLimitedUntil = until;
  const rem =
    readHeader(err?.headers, "x-ratelimit-remaining-requests") ||
    readHeader(err?.headers, "x-ratelimit-remaining");
  if (rem != null && rem !== "") s.limitRemaining = String(rem);
  globalState.lastRequest = { provider: id, at: now, rateLimited: true };
}

function getRateLimitedUntil(id) {
  return ensureLeg(id).rateLimitedUntil || 0;
}

function initAiMetricsMeta({ legIds, failoverPrimary, runtimeName }) {
  globalState.configuredLegs = Array.isArray(legIds) ? legIds.map(String) : [];
  globalState.failoverPrimary = String(failoverPrimary || "groq");
  globalState.runtimeName = String(runtimeName || "");
  for (const id of globalState.configuredLegs) ensureLeg(id);
}

function getAiAdminSnapshot(envModels) {
  const now = Date.now();
  const models = envModels || {};
  const legRows = globalState.configuredLegs.map((id) => {
    const s = ensureLeg(id);
    const rlMs = Math.max(0, (s.rateLimitedUntil || 0) - now);
    let status = "beklemede";
    if (rlMs > 0) status = "rate_limit";
    else if (s.lastSuccessAt && (!s.lastErrorAt || s.lastSuccessAt >= s.lastErrorAt)) status = "ok";
    else if (s.lastErrorAt && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) status = "hata";
    return {
      id,
      model: models[id] || null,
      lastSuccessAt: s.lastSuccessAt,
      lastErrorAt: s.lastErrorAt,
      lastErrorMessage: s.lastErrorMessage,
      rateLimitedUntil: s.rateLimitedUntil || 0,
      rateLimitedRemainingMs: rlMs,
      requestsOk: s.requestsOk,
      limitRemaining: s.limitRemaining,
      limitReset: s.limitReset,
      status,
    };
  });
  return {
    ok: true,
    runtimeName: globalState.runtimeName,
    failoverEnabled: globalState.runtimeName === "failover",
    failoverPrimary: globalState.failoverPrimary,
    lastRequest: globalState.lastRequest,
    legs: legRows,
    serverTime: now,
  };
}

module.exports = {
  ensureLeg,
  recordSuccess,
  recordError,
  recordRateLimit,
  getRateLimitedUntil,
  initAiMetricsMeta,
  getAiAdminSnapshot,
  parseRetryAfterMs,
};
