/**
 * Vercel AI Gateway (OpenAI uyumlu): POST {base}/chat/completions
 * Groq SDK /openai/v1/... yolunu kullandığı için burada fetch kullanılır.
 */

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

function createAiGatewayFetchProvider({ apiKey, baseURL }) {
  const key = String(apiKey || "").trim();
  const base = String(baseURL || "").replace(/\/$/, "");

  function assertReady() {
    if (!key || !base) {
      const err = new Error("AI Gateway yapılandırılmadı (AI_GATEWAY_API_KEY veya base URL eksik)");
      err.code = "AI_GATEWAY_MISSING";
      throw err;
    }
  }

  async function createMessage(params) {
    assertReady();
    const { model, max_tokens, temperature, system, messages } = params;
    const url = `${base}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: toOpenAiMessages(system, messages),
        max_tokens: max_tokens ?? 1024,
        temperature: temperature ?? 0.7,
      }),
    });
    const textBody = await res.text();
    let json = {};
    try {
      json = textBody ? JSON.parse(textBody) : {};
    } catch {
      json = { error: { message: textBody.slice(0, 200) } };
    }
    if (!res.ok) {
      const err = new Error(String(json?.error?.message || json?.message || res.statusText || "gateway_error"));
      err.status = res.status;
      err.statusCode = res.status;
      err.headers = res.headers;
      throw err;
    }
    const outText = String(json.choices?.[0]?.message?.content ?? "").trim();
    const u = json.usage;
    return {
      content: [{ type: "text", text: outText }],
      usage: u
        ? {
            input_tokens: u.prompt_tokens,
            output_tokens: u.completion_tokens,
          }
        : null,
      _wbResponseHeaders: res.headers,
    };
  }

  async function createMessageStream(params) {
    assertReady();
    const { model, max_tokens, temperature, system, messages } = params;
    const url = `${base}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: toOpenAiMessages(system, messages),
        max_tokens: max_tokens ?? 1024,
        temperature: temperature ?? 0.7,
        stream: true,
      }),
    });

    if (!res.ok) {
      const textBody = await res.text();
      let json = {};
      try {
        json = textBody ? JSON.parse(textBody) : {};
      } catch {
        json = {};
      }
      const err = new Error(String(json?.error?.message || json?.message || res.statusText || "gateway_stream_error"));
      err.status = res.status;
      err.statusCode = res.status;
      err.headers = res.headers;
      throw err;
    }

    async function* gen() {
      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Gateway stream okunamadı");
      }
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const block of parts) {
          const lines = block.split("\n");
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const payload = t.slice(5).trim();
            if (payload === "[DONE]") {
              yield { type: "message_stop", message: { usage: null } };
              return;
            }
            let chunk;
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (delta) {
              yield {
                type: "content_block_delta",
                delta: { type: "text_delta", text: String(delta) },
              };
            }
          }
        }
      }
      yield { type: "message_stop", message: { usage: null } };
    }
    return gen();
  }

  return { createMessage, createMessageStream };
}

module.exports = { createAiGatewayFetchProvider };
