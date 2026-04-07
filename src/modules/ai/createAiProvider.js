const { createAnthropicProvider } = require("./providers/anthropicProvider");
const { createGroqProvider, createOpenAiChatProvider } = require("./providers/groqProvider");
const { createAiGatewayFetchProvider } = require("./providers/aiGatewayFetchProvider");
const { createGeminiFlashProvider, createGeminiProProvider } = require("./providers/geminiProvider");
const { createFailoverAiProvider } = require("./failoverAiProvider");
const metrics = require("./aiProviderMetrics");

const DEFAULT_GATEWAY_BASE = "https://ai-gateway.vercel.sh/v1";

function normalizeAnthropicApiKey(raw) {
  let s = String(raw || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

function getGatewayKey() {
  return String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY || "").trim();
}

function getGatewayModel() {
  return String(process.env.AI_GATEWAY_MODEL || process.env.VERCEL_AI_GATEWAY_MODEL || "openai/gpt-4o-mini").trim();
}

function getGatewayBase() {
  const u = String(process.env.AI_GATEWAY_BASE_URL || process.env.VERCEL_AI_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE).trim();
  return u.replace(/\/$/, "");
}

function failoverDisabled() {
  const v = String(process.env.AI_FAILOVER || "").toLowerCase();
  return v === "0" || v === "false" || v === "off";
}

function getFailoverPrimary() {
  const p = String(process.env.AI_FAILOVER_PRIMARY || "groq").toLowerCase();
  return p === "gateway" || p === "ai_gateway" || p === "vercel" ? "ai_gateway" : "groq";
}

// ─── Gemini key helpers ─────────────────────────────────────────────────────
function getGeminiKey(n) {
  return String(process.env[`GEMINI_API_KEY_${n}`] || "").trim();
}

/**
 * Gemini Pro (key2) leg — sadece Premium abonelik kullanıcılar için.
 * @returns {{ id, client, model } | null}
 */
function buildGeminiProLeg() {
  const key2 = getGeminiKey(2);
  if (!key2) return null;
  return {
    id: "gemini_pro",
    client: createGeminiProProvider({ apiKey: key2 }),
    model: "gemini-1.5-pro",
  };
}

/**
 * Flash legs (key1 + key3) — tüm premium kullanıcılar için.
 * @returns {Array<{ id, client, model }>}
 */
function buildGeminiFlashLegs() {
  const legs = [];
  const key1 = getGeminiKey(1);
  const key3 = getGeminiKey(3);
  if (key1) legs.push({ id: "gemini_flash_1", client: createGeminiFlashProvider({ apiKey: key1 }), model: "gemini-2.0-flash" });
  if (key3) legs.push({ id: "gemini_flash_3", client: createGeminiFlashProvider({ apiKey: key3 }), model: "gemini-2.0-flash" });
  return legs;
}

/**
 * AI_PROVIDER=groq | anthropic | ai_gateway
 * İki anahtar (GROQ + AI_GATEWAY) ve AI_FAILOVER kapalı değilse otomatik yedekleme.
 */
function createAiRuntime() {
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const anthropicKey = normalizeAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  const gatewayKey = getGatewayKey();
  const mode = String(process.env.AI_PROVIDER || "").toLowerCase();

  if (mode === "anthropic") {
    metrics.initAiMetricsMeta({ legIds: ["anthropic"], failoverPrimary: "groq", runtimeName: "anthropic" });
    return {
      provider: createAnthropicProvider({ apiKey: anthropicKey }),
      name: "anthropic",
    };
  }

  const useFailover = Boolean(groqKey && gatewayKey && !failoverDisabled());
  if (useFailover) {
    const primary = getFailoverPrimary();
    const groqLeg = {
      id: "groq",
      client: createOpenAiChatProvider({
        apiKey: groqKey,
        missingKeyMessage: "GROQ_API_KEY eksik",
      }),
      model: String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
    };
    const gwLeg = {
      id: "ai_gateway",
      client: createAiGatewayFetchProvider({
        apiKey: gatewayKey,
        baseURL: getGatewayBase(),
      }),
      model: getGatewayModel(),
    };
    const provider = createFailoverAiProvider([groqLeg, gwLeg], { primary });
    metrics.initAiMetricsMeta({ legIds: ["groq", "ai_gateway"], failoverPrimary: primary, runtimeName: "failover" });
    return { provider, name: "failover" };
  }

  if (mode === "groq") {
    metrics.initAiMetricsMeta({ legIds: ["groq"], failoverPrimary: "groq", runtimeName: "groq" });
    return {
      provider: createGroqProvider({ apiKey: groqKey }),
      name: "groq",
    };
  }

  if (mode === "ai_gateway" || mode === "gateway") {
    metrics.initAiMetricsMeta({ legIds: ["ai_gateway"], failoverPrimary: "ai_gateway", runtimeName: "ai_gateway" });
    return {
      provider: createAiGatewayFetchProvider({
        apiKey: gatewayKey,
        baseURL: getGatewayBase(),
      }),
      name: "ai_gateway",
    };
  }

  if (groqKey) {
    metrics.initAiMetricsMeta({ legIds: ["groq"], failoverPrimary: "groq", runtimeName: "groq" });
    return {
      provider: createGroqProvider({ apiKey: groqKey }),
      name: "groq",
    };
  }

  if (gatewayKey) {
    metrics.initAiMetricsMeta({ legIds: ["ai_gateway"], failoverPrimary: "ai_gateway", runtimeName: "ai_gateway" });
    return {
      provider: createAiGatewayFetchProvider({
        apiKey: gatewayKey,
        baseURL: getGatewayBase(),
      }),
      name: "ai_gateway",
    };
  }

  metrics.initAiMetricsMeta({ legIds: ["anthropic"], failoverPrimary: "groq", runtimeName: "anthropic" });
  return {
    provider: createAnthropicProvider({ apiKey: anthropicKey }),
    name: "anthropic",
  };
}

/**
 * Standart failover provider — Groq + AI Gateway + Gemini Flash keys.
 * Tüm Premium/AI+ kullanıcılar için.
 */
function createStandardAiRuntime() {
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const gatewayKey = getGatewayKey();
  const geminiFlashLegs = buildGeminiFlashLegs();
  const legs = [];

  if (groqKey) legs.push({ id: "groq", client: createOpenAiChatProvider({ apiKey: groqKey }), model: String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile") });
  if (gatewayKey) legs.push({ id: "ai_gateway", client: createAiGatewayFetchProvider({ apiKey: gatewayKey, baseURL: getGatewayBase() }), model: getGatewayModel() });
  for (const gl of geminiFlashLegs) legs.push(gl);

  const legIds = legs.map((l) => l.id);
  if (legs.length >= 2) {
    metrics.initAiMetricsMeta({ legIds, failoverPrimary: legIds[0], runtimeName: "multi_failover" });
    return { provider: createFailoverAiProvider(legs, { primary: legIds[0] }), name: "multi_failover" };
  }
  if (legs.length === 1) {
    metrics.initAiMetricsMeta({ legIds, failoverPrimary: legIds[0], runtimeName: legIds[0] });
    return { provider: legs[0].client, name: legIds[0] };
  }
  return createAiRuntime();
}

/**
 * Premium abonelik runtime — Gemini Pro (key2) öncelikli, sonra standart havuz.
 * Sadece isPremiumUser(user) === true kullanıcılar için.
 */
function createPremiumAiRuntime() {
  const proLeg = buildGeminiProLeg();
  if (!proLeg) return createStandardAiRuntime();

  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const gatewayKey = getGatewayKey();
  const geminiFlashLegs = buildGeminiFlashLegs();
  const standardLegs = [];

  if (groqKey) standardLegs.push({ id: "groq", client: createOpenAiChatProvider({ apiKey: groqKey }), model: String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile") });
  if (gatewayKey) standardLegs.push({ id: "ai_gateway", client: createAiGatewayFetchProvider({ apiKey: gatewayKey, baseURL: getGatewayBase() }), model: getGatewayModel() });
  for (const gl of geminiFlashLegs) standardLegs.push(gl);

  const legs = [proLeg, ...standardLegs];
  const legIds = legs.map((l) => l.id);
  metrics.initAiMetricsMeta({ legIds, failoverPrimary: "gemini_pro", runtimeName: "premium_gemini_pro" });
  return { provider: createFailoverAiProvider(legs, { primary: "gemini_pro" }), name: "premium_gemini_pro" };
}

function getAiModel(providerName) {
  if (providerName === "groq") {
    return String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
  }
  if (providerName === "ai_gateway") {
    return getGatewayModel();
  }
  if (providerName === "failover") {
    return getFailoverPrimary() === "ai_gateway" ? getGatewayModel() : String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
  }
  return String(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022");
}

const GROQ_AUTH_HELP =
  "Groq API anahtarı geçersiz. console.groq.com → API Keys üzerinden anahtar oluştur; Railway’de GROQ_API_KEY güncelle ve yeniden deploy et.";

const GROQ_RATE_HELP =
  "Groq ücretsiz katman hız limiti aşıldı. Bir süre sonra tekrar dene veya console.groq.com üzerinden limit/plan kontrol et.";

const GATEWAY_AUTH_HELP =
  "Vercel AI Gateway anahtarı geçersiz. Vercel Dashboard → AI Gateway → API Keys; Railway’de AI_GATEWAY_API_KEY güncelle.";

const GATEWAY_RATE_HELP =
  "AI Gateway hız veya kota limiti. Vercel AI Gateway kullanımını kontrol et; yedek olarak Groq tanımlıysa otomatik denenir.";

const FAILOVER_EXHAUSTED =
  "Şu an hem Groq hem AI Gateway hız limitine takılmış görünüyor. Bir süre sonra tekrar dene veya plan/limitleri kontrol et.";

function formatAiError(err, providerName) {
  const msg = String(err?.message || "");
  const status = err?.status ?? err?.statusCode;

  if (providerName === "failover") {
    if (status === 429 || msg.toLowerCase().includes("rate_limit") || msg.toLowerCase().includes("too many requests")) {
      return { http: 429, code: "ai_failover_rate_limit", message: FAILOVER_EXHAUSTED };
    }
    if (status === 401 || status === 403) {
      return { http: 502, code: "ai_failover_auth", message: "AI anahtarlarından biri geçersiz olabilir. Groq ve AI Gateway anahtarlarını kontrol et." };
    }
    return { http: status && status >= 400 && status < 600 ? status : 500, code: "ai_error", message: msg || "AI hatası" };
  }

  if (providerName === "groq" || providerName === "ai_gateway") {
    const authHelp = providerName === "groq" ? GROQ_AUTH_HELP : GATEWAY_AUTH_HELP;
    const rateHelp = providerName === "groq" ? GROQ_RATE_HELP : GATEWAY_RATE_HELP;
    if (status === 401 || status === 403 || msg.includes("Invalid API Key") || msg.includes("invalid_api_key")) {
      return { http: 502, code: `${providerName}_auth_invalid`, message: authHelp };
    }
    if (status === 429 || msg.includes("rate_limit")) {
      return { http: 429, code: `${providerName}_rate_limit`, message: rateHelp };
    }
    return { http: status && status >= 400 && status < 600 ? status : 500, code: "ai_error", message: msg || "AI hatası" };
  }

  const nestedErr = err?.error?.error;
  const nestedMsg =
    typeof nestedErr === "object" && nestedErr && typeof nestedErr.message === "string"
      ? nestedErr.message
      : "";
  const haystack = `${msg} ${nestedMsg}`;
  const ANTHROPIC_AUTH_HELP =
    "Anthropic API anahtarı geçersiz veya iptal edilmiş. console.anthropic.com üzerinden yeni anahtar oluştur; yerelde ydt-kelime/.env içinde ANTHROPIC_API_KEY güncelle, Railway/Render’da Variables’a yaz ve sunucuyu yeniden başlat.";
  const ANTHROPIC_BILLING_HELP =
    "Anthropic hesabında kullanılabilir kredi yok veya bakiye yetersiz. console.anthropic.com → Plans & Billing bölümünden kredi satın al veya planı yükselt.";

  const looksLikeAnthropic401 =
    status === 401 ||
    msg.includes('"authentication_error"') ||
    msg.includes("Invalid authentication credentials") ||
    /^401\s+\{/.test(msg.trim());
  if (looksLikeAnthropic401) {
    return { http: 502, code: "anthropic_auth_invalid", message: ANTHROPIC_AUTH_HELP };
  }
  const looksLikeInsufficientCredits =
    haystack.includes("credit balance is too low") ||
    haystack.includes("purchase credits") ||
    (haystack.includes("Plans & Billing") && haystack.includes("Anthropic API"));
  if (looksLikeInsufficientCredits) {
    return { http: 503, code: "anthropic_insufficient_credits", message: ANTHROPIC_BILLING_HELP };
  }
  return { http: 500, code: "ai_error", message: msg || "AI hatası" };
}

function getAiAdminSnapshot() {
  return metrics.getAiAdminSnapshot({
    groq: String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile"),
    ai_gateway: getGatewayModel(),
    anthropic: String(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"),
  });
}

module.exports = {
  createAiRuntime,
  createStandardAiRuntime,
  createPremiumAiRuntime,
  getAiModel,
  formatAiError,
  normalizeAnthropicApiKey,
  getAiAdminSnapshot,
};
