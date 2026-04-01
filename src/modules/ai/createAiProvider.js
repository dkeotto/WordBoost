const { createAnthropicProvider } = require("./providers/anthropicProvider");
const { createGroqProvider } = require("./providers/groqProvider");

function normalizeAnthropicApiKey(raw) {
  let s = String(raw || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

/**
 * AI_PROVIDER=groq | anthropic
 * Belirtilmezse: GROQ_API_KEY varsa Groq, yoksa Anthropic.
 */
function createAiRuntime() {
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const anthropicKey = normalizeAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  const mode = String(process.env.AI_PROVIDER || "").toLowerCase();

  if (mode === "anthropic") {
    return {
      provider: createAnthropicProvider({ apiKey: anthropicKey }),
      name: "anthropic"
    };
  }
  if (mode === "groq") {
    return {
      provider: createGroqProvider({ apiKey: groqKey }),
      name: "groq"
    };
  }

  if (groqKey) {
    return {
      provider: createGroqProvider({ apiKey: groqKey }),
      name: "groq"
    };
  }
  return {
    provider: createAnthropicProvider({ apiKey: anthropicKey }),
    name: "anthropic"
  };
}

function getAiModel(providerName) {
  if (providerName === "groq") {
    return String(process.env.GROQ_MODEL || "llama-3.3-70b-versatile");
  }
  return String(process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022");
}

const GROQ_AUTH_HELP =
  "Groq API anahtarı geçersiz. console.groq.com → API Keys üzerinden anahtar oluştur; Railway’de GROQ_API_KEY güncelle ve yeniden deploy et.";

const GROQ_RATE_HELP =
  "Groq ücretsiz katman hız limiti aşıldı. Bir süre sonra tekrar dene veya console.groq.com üzerinden limit/plan kontrol et.";

function formatAiError(err, providerName) {
  const msg = String(err?.message || "");

  if (providerName === "groq") {
    const status = err?.status ?? err?.statusCode;
    if (status === 401 || status === 403 || msg.includes("Invalid API Key") || msg.includes("invalid_api_key")) {
      return { http: 502, code: "groq_auth_invalid", message: GROQ_AUTH_HELP };
    }
    if (status === 429 || msg.includes("rate_limit")) {
      return { http: 429, code: "groq_rate_limit", message: GROQ_RATE_HELP };
    }
    return { http: status && status >= 400 && status < 600 ? status : 500, code: "ai_error", message: msg || "AI hatası" };
  }

  const status = err?.status ?? err?.statusCode;
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

module.exports = {
  createAiRuntime,
  getAiModel,
  formatAiError,
  normalizeAnthropicApiKey
};
