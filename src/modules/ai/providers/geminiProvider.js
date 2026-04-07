/**
 * Gemini Provider — Google Generative Language API (OpenAI-compatible format)
 * Base URL: https://generativelanguage.googleapis.com/v1beta/openai
 *
 * Env Variables:
 *   GEMINI_API_KEY_1  — Standart model (gemini-2.0-flash) — tüm premium kullanıcılar
 *   GEMINI_API_KEY_2  — Gelişmiş model (gemini-1.5-pro) — SADECE Premium abonelik
 *   GEMINI_API_KEY_3  — Standart model (gemini-2.0-flash) — yedek key
 */

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const GEMINI_FLASH_MODEL = "gemini-2.0-flash";
const GEMINI_PRO_MODEL = "gemini-1.5-pro";

function toOpenAiMessages(system, messages) {
  const m = Array.isArray(messages) ? messages : [];
  const out = [];
  if (system && String(system).trim()) {
    out.push({ role: "system", content: String(system) });
  }
  for (const row of m) {
    const role = row.role === "assistant" ? "assistant" : "user";
    out.push({ role, content: String(row.content ?? "") });
  }
  return out;
}

function createGeminiProvider({ apiKey, model, missingKeyMessage }) {
  const key = String(apiKey || "").trim();
  const chosenModel = String(model || GEMINI_FLASH_MODEL);
  const missingMsg = String(missingKeyMessage || "Gemini API anahtarı eksik");

  function assertReady() {
    if (!key) {
      const err = new Error(missingMsg);
      err.code = "GEMINI_KEY_MISSING";
      throw err;
    }
  }

  async function fetchGemini(body) {
    const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let json = {};
      try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { error: { message: text } }; }
      const msg = json?.error?.message || `Gemini HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.statusCode = res.status;
      throw err;
    }
    return res;
  }

  async function createMessage(params) {
    assertReady();
    const { max_tokens, temperature, system, messages } = params;
    const res = await fetchGemini({
      model: chosenModel,
      messages: toOpenAiMessages(system, messages),
      max_tokens: max_tokens ?? 1200,
      temperature: temperature ?? 0.7,
    });
    const json = await res.json();
    const text = String(json?.choices?.[0]?.message?.content ?? "").trim();
    const u = json?.usage;
    return {
      content: [{ type: "text", text }],
      usage: u ? { input_tokens: u.prompt_tokens, output_tokens: u.completion_tokens } : null,
    };
  }

  async function createMessageStream(params) {
    assertReady();
    const { max_tokens, temperature, system, messages } = params;
    const res = await fetchGemini({
      model: chosenModel,
      messages: toOpenAiMessages(system, messages),
      max_tokens: max_tokens ?? 1200,
      temperature: temperature ?? 0.7,
      stream: true,
    });

    async function* gen() {
      const reader = res.body?.getReader?.() || null;
      if (!reader) throw new Error("Streaming desteklenmiyor");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          const l = line.trim();
          if (!l || l === "data: [DONE]" || !l.startsWith("data:")) continue;
          let payload;
          try { payload = JSON.parse(l.slice(5).trim()); } catch { continue; }
          const content = payload?.choices?.[0]?.delta?.content;
          if (content) {
            yield {
              type: "content_block_delta",
              delta: { type: "text_delta", text: String(content) },
            };
          }
        }
      }
      yield { type: "message_stop", message: { usage: null } };
    }

    return gen();
  }

  return { createMessage, createMessageStream };
}

/** Flash (gemini-2.0-flash) — standart premium kullanıcılar için */
function createGeminiFlashProvider({ apiKey }) {
  return createGeminiProvider({
    apiKey,
    model: GEMINI_FLASH_MODEL,
    missingKeyMessage: "Gemini Flash API anahtarı (GEMINI_API_KEY_1 veya _3) eksik",
  });
}

/** Pro (gemini-1.5-pro) — sadece Premium abonelik kullanıcıları için */
function createGeminiProProvider({ apiKey }) {
  return createGeminiProvider({
    apiKey,
    model: GEMINI_PRO_MODEL,
    missingKeyMessage: "Gemini Pro API anahtarı (GEMINI_API_KEY_2) eksik",
  });
}

module.exports = {
  createGeminiProvider,
  createGeminiFlashProvider,
  createGeminiProProvider,
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
};
