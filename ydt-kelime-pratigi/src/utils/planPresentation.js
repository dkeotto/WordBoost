/** Paddle / manuel modda kartlarda gösterilecek Türkçe özet (API alanı boşsa doldurur). */
export const TIER_ORDER = ["premium", "aiPlus", "classroom"];

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

export function mergePlansWithFallback(apiItems) {
  const list = Array.isArray(apiItems) ? apiItems : [];
  const merged = list.map((api) => {
    const fb = PLAN_FALLBACK_TR[api.tier] || {};
    return {
      ...api,
      label: api.label || fb.label || api.tier,
      description: api.description || fb.description || "",
      displayPrice: api.displayPrice || fb.displayPrice || "",
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
  return a || b || "";
}
