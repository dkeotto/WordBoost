# Vercel ile deploy

Bu klasör (`ydt-kelime-pratigi`) Vite + React istemcisidir. **Express + MongoDB + Socket.io** sunucusu ayrı çalışır (ör. Railway’de `server.js`).

## Vercel projesi

1. [vercel.com](https://vercel.com) → **Add New Project** → Git reposunu bağla.
2. **Root Directory**: Repo kökü `YDT` ise `ydt-kelime/ydt-kelime-pratigi` seç.
3. **Build Command**: `npm run build` (varsayılan)
4. **Output Directory**: `dist` (Vite; Vercel genelde otomatik bulur)

## Ortam değişkenleri

| Değişken | Nerede | Açıklama |
|----------|--------|----------|
| `BACKEND_URL` | Vercel → Settings → Environment Variables | Railway (veya başka host) kök URL’i, **sonunda `/` olmadan**: `https://xxx.railway.app`. `/api/*` istekleri sunucusuz fonksiyonla buraya proxylanır. |
| `VITE_SOCKET_URL` | Aynı | Socket.io için **aynı** backend kök URL’i. Üretim build’inde gömülür. |
| `VITE_ADSENSE_*`, `VITE_PADDLE_CLIENT_TOKEN` | Aynı | Mevcut `.env.example` ile uyumlu. |

**Not:** `BACKEND_URL` `VITE_` ile başlamaz; sadece Vercel’deki `api/[...path].js` çalışma zamanında okur. `VITE_*` değişkenleri her deploy öncesi build’e dahil edilir.

## Yerel önizleme

```bash
npm run build && npx vercel dev
```

`vercel dev` için `.env` içinde `BACKEND_URL` ve isteğe bağlı `VITE_SOCKET_URL` tanımlayabilirsin.

## Backend

Railway’deki serviste `PORT`, MongoDB, session vb. env’ler eskisi gibi kalır. İstemci artık kendi domain’inden `/api` çağırır; tarayıcı açısından tek origin Vercel’dir.
