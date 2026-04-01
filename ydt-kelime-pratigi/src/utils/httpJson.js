/**
 * fetch yanıtını güvenle JSON’a çevirir; HTML hata sayfası dönünce anlamlı hata verir.
 */
export async function readResponseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    const err = new Error(
      plain
        ? `Sunucu JSON yerine metin döndü (HTTP ${res.status}): ${plain}`
        : `Geçersiz yanıt (HTTP ${res.status}). BACKEND_URL / API yolunu kontrol et.`
    );
    err.status = res.status;
    throw err;
  }
}
