function parseBillingPlansFromEnv() {
  const raw = String(process.env.PADDLE_PRICE_IDS || "").trim();
  if (!raw) return { ok: false, error: "PADDLE_PRICE_IDS eksik", plans: [] };

  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: "PADDLE_PRICE_IDS JSON değil", plans: [] };
  }

  const plans = Object.entries(obj || {}).map(([tier, v]) => {
    const priceId = String(v?.priceId || v?.price_id || "").trim();
    const label = String(v?.label || tier).trim();
    const description = String(v?.description || "").trim();
    const defaultQuantity = Number.isFinite(Number(v?.defaultQuantity)) ? Number(v.defaultQuantity) : 1;
    const allowQuantity = Boolean(v?.allowQuantity);
    const features = Array.isArray(v?.features) ? v.features.map((x) => String(x)) : [];
    const entitlements = v?.entitlements && typeof v.entitlements === "object" ? v.entitlements : {};
    const displayPrice = String(v?.displayPrice || v?.priceNote || v?.price_label || "").trim();
    return { tier, priceId, label, description, displayPrice, defaultQuantity, allowQuantity, features, entitlements };
  });

  const bad = plans.find((p) => !p.tier || !p.priceId || !p.priceId.startsWith("pri_"));
  if (bad) return { ok: false, error: `PADDLE_PRICE_IDS içinde geçersiz priceId (${bad.tier})`, plans: [] };

  return { ok: true, error: null, plans };
}

function findPlan(plans, tier) {
  const t = String(tier || "").trim();
  return plans.find((p) => p.tier === t) || null;
}

module.exports = { parseBillingPlansFromEnv, findPlan };

