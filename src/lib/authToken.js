function getAuthTokenFromHeader(req) {
  const raw = String(req?.headers?.authorization || "").trim();
  if (!raw) return "";
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : raw;
}

module.exports = { getAuthTokenFromHeader };

