function paddleBaseUrl() {
  const env = String(process.env.PADDLE_ENV || "").trim().toLowerCase();
  return env === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

function requirePaddleApiKey() {
  const key = String(process.env.PADDLE_API_KEY || "").trim();
  if (!key) {
    const err = new Error("PADDLE_API_KEY eksik");
    err.code = "PADDLE_API_KEY_MISSING";
    throw err;
  }
  return key;
}

async function paddleRequest(path, { method = "GET", body = null } = {}) {
  const apiKey = requirePaddleApiKey();
  const url = `${paddleBaseUrl()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = null;
  }

  if (!res.ok) {
    const err = new Error(json?.error?.detail || json?.message || `Paddle API error (${res.status})`);
    err.status = res.status;
    err.paddle = json;
    throw err;
  }

  return json;
}

module.exports = { paddleBaseUrl, paddleRequest };

