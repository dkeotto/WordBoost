const metrics = require("./aiProviderMetrics");

function isRetryableRateLimit(err) {
  const s = err?.status ?? err?.statusCode;
  if (s === 429) return true;
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("rate_limit") || msg.includes("too many requests");
}

/** İlk uç başarısız olunca diğer uca geç: 429, geçersiz anahtar (401/403), sunucu hatası (5xx). */
function shouldTryNextProvider(err) {
  if (isRetryableRateLimit(err)) return true;
  const s = err?.status ?? err?.statusCode;
  if (s === 401 || s === 403) return true;
  if (typeof s === "number" && s >= 500 && s < 600) return true;
  const raw = String(err?.message || "");
  const low = raw.toLowerCase();
  if (low.includes("invalid_api_key") || low.includes("invalid api key")) return true;
  if (/^401\b/.test(raw.trim())) return true;
  return false;
}

/**
 * @param {{ id: string, client: { createMessage: Function, createMessageStream: Function }, model: string }[]} legs - tam iki eleman [groq, gateway]
 * @param {{ primary: 'groq' | 'ai_gateway' }} opts
 */
function createFailoverAiProvider(legs, opts = {}) {
  const primary = opts.primary === "ai_gateway" ? "ai_gateway" : "groq";
  const list = Array.isArray(legs) ? legs.filter((x) => x && x.client && x.model) : [];
  if (list.length < 2) {
    throw new Error("failoverAiProvider: en az iki sağlayıcı gerekli");
  }

  function orderedLegs() {
    const a = list.find((l) => l.id === primary) || list[0];
    const b = list.find((l) => l !== a) || list[1];
    const pair = [a, b].filter(Boolean);
    const now = Date.now();
    const free = pair.filter((l) => metrics.getRateLimitedUntil(l.id) <= now);
    const blocked = pair.filter((l) => metrics.getRateLimitedUntil(l.id) > now);
    return [...free, ...blocked];
  }

  async function createMessage(params) {
    const order = orderedLegs();
    let lastErr = null;
    for (const leg of order) {
      try {
        const resp = await leg.client.createMessage({ ...params, model: leg.model });
        try {
          const h = resp?._wbResponseHeaders;
          metrics.recordSuccess(leg.id, h || null);
        } catch (_) {
          metrics.recordSuccess(leg.id, null);
        }
        return { ...resp, wbLog: { provider: leg.id, model: leg.model } };
      } catch (e) {
        lastErr = e;
        if (isRetryableRateLimit(e)) {
          metrics.recordRateLimit(leg.id, e);
          continue;
        }
        if (shouldTryNextProvider(e)) {
          metrics.recordError(leg.id, e);
          continue;
        }
        metrics.recordError(leg.id, e);
        throw e;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error("AI sağlayıcı yok");
  }

  async function createMessageStream(params) {
    const order = orderedLegs();
    let lastErr = null;
    for (const leg of order) {
      try {
        const inner = await leg.client.createMessageStream({ ...params, model: leg.model });
        const wbStreamMeta = { provider: leg.id, model: leg.model };
        async function* gen() {
          try {
            for await (const ev of inner) {
              yield ev;
            }
            metrics.recordSuccess(leg.id, null);
          } catch (e) {
            if (isRetryableRateLimit(e)) metrics.recordRateLimit(leg.id, e);
            else metrics.recordError(leg.id, e);
            throw e;
          }
        }
        return {
          wbStreamMeta,
          async *[Symbol.asyncIterator]() {
            yield* gen();
          },
        };
      } catch (e) {
        lastErr = e;
        if (isRetryableRateLimit(e)) {
          metrics.recordRateLimit(leg.id, e);
          continue;
        }
        if (shouldTryNextProvider(e)) {
          metrics.recordError(leg.id, e);
          continue;
        }
        metrics.recordError(leg.id, e);
        throw e;
      }
    }
    if (lastErr) throw lastErr;
    throw new Error("AI sağlayıcı yok");
  }

  return { createMessage, createMessageStream };
}

module.exports = { createFailoverAiProvider, isRetryableRateLimit, shouldTryNextProvider };
