const Groq = require("groq-sdk");

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

/**
 * Groq API veya OpenAI uyumlu uç (ör. Vercel AI Gateway: baseURL + apiKey).
 */
function createOpenAiChatProvider({ apiKey, baseURL, missingKeyMessage }) {
  const key = String(apiKey || "").trim();
  const opts = key ? { apiKey: key } : {};
  if (baseURL && String(baseURL).trim()) {
    opts.baseURL = String(baseURL).trim().replace(/\/$/, "");
  }
  const client = key ? new Groq(opts) : null;
  const missingMsg = String(missingKeyMessage || "API anahtarı eksik");

  function assertReady() {
    if (!client) {
      const err = new Error(missingMsg);
      err.code = "OPENAI_COMPAT_KEY_MISSING";
      throw err;
    }
  }

  async function createMessage(params) {
    assertReady();
    const { model, max_tokens, temperature, system, messages } = params;
    const completion = await client.chat.completions.create({
      model,
      messages: toOpenAiMessages(system, messages),
      max_tokens: max_tokens ?? 1024,
      temperature: temperature ?? 0.7,
    });
    const text = String(completion.choices?.[0]?.message?.content ?? "").trim();
    const u = completion.usage;
    const out = {
      content: [{ type: "text", text }],
      usage: u
        ? {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
          }
        : null,
    };
    const respHeaders = completion?.response?.headers;
    if (respHeaders && typeof respHeaders.get === "function") {
      out._wbResponseHeaders = respHeaders;
    }
    return out;
  }

  async function createMessageStream(params) {
    assertReady();
    const { model, max_tokens, temperature, system, messages } = params;
    const stream = await client.chat.completions.create({
      model,
      messages: toOpenAiMessages(system, messages),
      max_tokens: max_tokens ?? 1024,
      temperature: temperature ?? 0.7,
      stream: true,
    });

    async function* gen() {
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          yield {
            type: "content_block_delta",
            delta: { type: "text_delta", text: String(content) },
          };
        }
      }
      yield { type: "message_stop", message: { usage: null } };
    }
    return gen();
  }

  return { createMessage, createMessageStream };
}

function createGroqProvider({ apiKey }) {
  return createOpenAiChatProvider({
    apiKey,
    baseURL: undefined,
    missingKeyMessage: "AI yapılandırılmadı (GROQ_API_KEY eksik)",
  });
}

module.exports = { createGroqProvider, createOpenAiChatProvider };
