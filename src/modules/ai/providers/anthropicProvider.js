const Anthropic = require("@anthropic-ai/sdk");

function createAnthropicProvider({ apiKey }) {
  const key = String(apiKey || "").trim();
  const client = key ? new Anthropic({ apiKey: key }) : null;

  function assertReady() {
    if (!client) {
      const err = new Error("AI yapılandırılmadı (ANTHROPIC_API_KEY eksik)");
      err.code = "ANTHROPIC_API_KEY_MISSING";
      throw err;
    }
  }

  async function createMessage(params) {
    assertReady();
    return await client.messages.create(params);
  }

  async function createMessageStream(params) {
    assertReady();
    return await client.messages.create({ ...params, stream: true });
  }

  return { createMessage, createMessageStream };
}

module.exports = { createAnthropicProvider };

