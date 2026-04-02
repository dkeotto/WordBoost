/** Premium abonelik veya AI+ (sınırsız AI / sohbet) — backend hasUnlimitedAiMode ile aynı mantık */
export function hasUnlimitedAiClient(user) {
  if (!user) return false;
  if (user.isPremium === true) return true;
  try {
    if (user.premiumUntil && new Date(user.premiumUntil).getTime() > Date.now()) return true;
  } catch {
    /* ignore */
  }
  return user?.entitlements?.aiPlus === true;
}

/** İstemci tarafında premium (abonelik) görünürlüğü — /api/me veya profil yanıtlarıyla uyumlu */
export function isUserPremium(user) {
  if (!user) return false;
  if (user.isPremium === true) return true;
  try {
    if (!user.premiumUntil) return false;
    return new Date(user.premiumUntil).getTime() > Date.now();
  } catch {
    return false;
  }
}

export function formatPremiumUntilTr(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("tr-TR", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return "";
  }
}
