/** Paddle / manuel modda kartlarda gösterilecek Türkçe özet (API alanı boşsa doldurur). */
export const TIER_ORDER = ["premium", "aiPlus", "classroom"];

/** Sunucu / env’de fiyat metni yoksa kartlarda yine de bir satır gösterilir. */
export const GENERIC_PLAN_PRICE_HINT =
  "Güncel tutar — aşağıdaki e-postadan paket tipini yazarak sorabilirsin.";

export const DEFAULT_WORDBOOST_SALES_EMAIL = "wordboost.team@gmail.com";

export const PLAN_FALLBACK_TR = {
  premium: {
    label: "WordBoost Premium",
    description:
      "Sınırsız kelime pratiği, AI Writing Mode, akıllı tekrar sistemi, detaylı istatistikler ve reklamsız öğrenme.",
    displayPrice: "Aylık / yıllık abonelik — güncel tutar için iletişime geçin",
    features: ["AI+ özellikleri dahil", "Sınırsız kelime erişimi", "İlerleme takibi", "Reklamsız deneyim"],
  },
  aiPlus: {
    label: "WordBoost AI+",
    description:
      "Yapay zekâ ile anlık düzeltme, cümle geliştirme ve yazılı İngilizce pratiği. Tek seferlik ödeme, kalıcı erişim.",
    displayPrice: "Tek seferlik paket — tutar için iletişime geçin",
    features: ["AI yazım ve pratik", "Anlık geri bildirim", "Tek seferlik lisans"],
  },
  classroom: {
    label: "WordBoost Okul / Sınıf",
    description:
      "Öğretmen paneli, sınıf kodu, toplu öğrenci yönetimi ve sınıf analitiği. İhtiyaca göre lisans adedi.",
    displayPrice: "Öğrenci / okul paketi — kurumsal teklif için iletişime geçin",
    features: ["Sınıf oluşturma ve kod", "CSV ile toplu hesap", "Öğrenci analitiği", "Esnek lisans sayısı"],
  },
};

/** Env anahtarı ile PLAN_FALLBACK_TR eşlemesi (yazım varyasyonları). Checkout tier’ı değiştirilmez. */
export function canonicalTierForFallback(tier) {
  const k = String(tier || "").trim();
  if (PLAN_FALLBACK_TR[k]) return k;
  const n = k.toLowerCase().replace(/[\s_-]/g, "");
  const aliases = {
    aiplus: "aiPlus",
    premium: "premium",
    pro: "premium",
    classroom: "classroom",
    school: "classroom",
    okul: "classroom",
    sinif: "classroom",
  };
  return aliases[n] || k;
}

function computeDisplayPrice(api) {
  const apiPrice = String(api?.displayPrice ?? "").trim();
  if (apiPrice) return apiPrice;
  const fbTier = canonicalTierForFallback(api?.tier);
  const fb = PLAN_FALLBACK_TR[fbTier] || {};
  const fbPrice = String(fb?.displayPrice ?? "").trim();
  if (fbPrice) return fbPrice;
  return GENERIC_PLAN_PRICE_HINT;
}

/** Tek bir plan nesnesi için kartta gösterilecek fiyat metni (API + yerel özet). */
export function resolveDisplayPriceForPlan(plan) {
  return computeDisplayPrice(plan);
}

export function mergePlansWithFallback(apiItems) {
  const list = Array.isArray(apiItems) ? apiItems : [];
  const merged = list.map((api) => {
    const fbTier = canonicalTierForFallback(api.tier);
    const fb = PLAN_FALLBACK_TR[fbTier] || {};
    return {
      ...api,
      label: api.label || fb.label || api.tier,
      description: api.description || fb.description || "",
      displayPrice: computeDisplayPrice(api),
      features:
        Array.isArray(api.features) && api.features.length > 0 ? api.features : fb.features || [],
    };
  });
  merged.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));
  return merged;
}

export function plansForManualMode() {
  return TIER_ORDER.map((tier) => ({ tier, ...PLAN_FALLBACK_TR[tier] }));
}

export function getSalesEmail() {
  const a = String(import.meta.env.VITE_SALES_EMAIL || "").trim();
  const b = String(import.meta.env.VITE_CONTACT_EMAIL || "").trim();
  return a || b || DEFAULT_WORDBOOST_SALES_EMAIL;
}
