# Vercel ile deploy (tam uyumluluk)

**Üretim domain:** `https://wordboost.com.tr/` — Vercel’de bu hostname’i projeye bağla (DNS).

Bu klasör **Vite + React** istemcisidir. **Express** (`ydt-kelime/server.js`) Vercel’de çalışmaz; Railway vb. üzerinde kalır. `/api/*` istekleri `api/[...path].js` + `lib/vercelApiProxy.mjs` ile backend’e proxylanır.

## İki geçerli kurulum

### 1) Önerilen — Root Directory = `ydt-kelime/ydt-kelime-pratigi`

Git reposu `YDT` monoreposu olsa bile Vercel’de **sadece bu klasörü** proje kökü yap.

| Ayar | Değer |
|------|--------|
| **Root Directory** | `ydt-kelime/ydt-kelime-pratigi` (repo sadece `ydt-kelime` ise: `ydt-kelime-pratigi`) |
| **Install Command** | *(boş / varsayılan)* `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Framework Preset** | Vite (otomatik) |

Bu modda **bu klasördeki** `vercel.json` kullanılır; `YDT/vercel.json` **devre dışı** kalır (kök dizin deploy edilmediği için).

### 2) Monorepo kökü — Root Directory = `.` (YDT)

Tüm repoyu Vercel kökü seçtiysen üst dizindeki `vercel.json` devreye girer: `install` / `build` / `output` `ydt-kelime/ydt-kelime-pratigi` altına yönlendirilir. **`/api/*`** istekleri önce **`middleware.js`** (Node runtime, `lib/vercelMiddlewareProxy.mjs`) ile Railway’e iletilir; böylece yalnızca `api/[...path].js` algılanmadığında oluşan **404 NOT_FOUND** (ör. `/api/auth/google`) engellenir. İsteğe bağlı **`api/[...path].js`** aynı proxy’yi tekrarlar.

**Özel Build / Install override kullanma** — çakışma yapar. Varsayılan `npm install` + `npm run build` yeterli (kök `package.json` script’leri ile uyumlu).

## Ortam değişkenleri (Vercel)

| Değişken | Build’e gömülür mü | Açıklama |
|----------|-------------------|----------|
| `BACKEND_URL` | Hayır | Zorunlu. Railway Express kök URL’i, **sonunda `/` yok**. |
| `VITE_SOCKET_URL` | Evet | Socket.io için Railway kök URL (Google girişi artık aynı origin `/api/auth/*` ile; VITE OAuth için zorunlu değil). |
| `VITE_BACKEND_URL` | Evet | İsteğe bağlı; Socket / eski senaryolar. |
| `VITE_ADSENSE_*`, `VITE_PADDLE_CLIENT_TOKEN` | Evet | `.env.example` ile aynı. |

`BACKEND_URL` **`VITE_` öneki almaz**; **Routing Middleware** ve `api/[...path].js` proxy’si bunu okur (Vercel ortam değişkenlerinde tanımlı olmalı).

### AI yazma (SSE / stream) 404 veya `not_found_error` (model)

- **İstemci:** `VITE_SOCKET_URL` **veya** `VITE_BACKEND_URL` = Railway Express kökü (`https://xxx.up.railway.app`), **sonunda `/` yok**. Build’e gömülür; tanımladıktan sonra **yeniden deploy** gerekir. Böylece `/api/ai/write/stream`, `/api/ai/rewrite/stream`, `/api/ai/chat/stream` gibi SSE istekleri Vercel proxy’sini atlayıp doğrudan Railway’e gider.
- **Railway (backend):** **Groq:** `GROQ_API_KEY` (ve isteğe bağlı `GROQ_MODEL`, varsayılan `llama-3.3-70b-versatile`). `AI_PROVIDER=groq` ile zorunlu Groq; boş bırakıp yalnızca `GROQ_API_KEY` doldurursan varsayılan sağlayıcı Groq olur. **Anthropic:** `AI_PROVIDER=anthropic` veya Groq anahtarı yokken `ANTHROPIC_API_KEY` + tarihli `ANTHROPIC_MODEL` (örn. `claude-3-5-sonnet-20241022`). [Groq modeller](https://console.groq.com/docs/models), [Anthropic modeller](https://docs.anthropic.com/en/docs/about-claude/models).

### Google ile giriş (OAuth)

Sunucu (`server.js`) canlıda **`redirect_uri`** olarak şunu üretir: **`https://wordboost.com.tr/api/auth/google/callback`** (Vercel `/api/auth/*` → Railway `/auth/*`).

#### Google Cloud Console → OAuth istemcisi

**Yetkili JavaScript kökenleri** (Authorized JavaScript origins):

| Ekle | Örnek |
|------|--------|
| Zorunlu (canlı) | `https://wordboost.com.tr` |
| İsteğe bağlı (lokal Vite) | `http://localhost:5173` |
| İsteğe bağlı (doğrudan Railway testi) | `https://wordboost.up.railway.app` |

**Yetkili yönlendirme URI’leri** (Authorized redirect URIs) — **Google’ın birebir eşleştirdiği adres; yanlış path `redirect_uri_mismatch` verir.**

| Durum | URI |
|--------|-----|
| **Canlı — mutlaka olmalı** | `https://wordboost.com.tr/api/auth/google/callback` |
| Lokal (backend `localhost:3000`) | `http://localhost:3000/auth/google/callback` |
| İsteğe bağlı (eski / yedek) | `https://wordboost.up.railway.app/auth/google/callback` |

**Sil / kullanma (yanlış veya gereksiz):**

- `https://wordboost.com.tr/auth/google/callback` → **yanlış** (arada `/api` yok; kod `/api/auth/...` kullanıyor).
- `https://wordboost.com.tr/auth/google` → callback değil; genelde **gereksiz**.
- `https://wordboost.com.tr/` → OAuth callback **değil**; **sil**.

Özet: Listende **sadece** yukarıdaki “mutlaka” + ihtiyacın olan lokal/Railway satırları kalsın; **`…/api/auth/google/callback`** canlı domain için şart.

#### Hata: `Error 400: redirect_uri_mismatch`

Google, uygulamanın gönderdiği `redirect_uri` ile Console’daki **Authorized redirect URIs** listesindeki satırlardan birini **karakter karakter** eşleştirmek zorunda.

1. Railway deploy loglarında veya `server.js` başlangıcında şu satıra bak: **`Google OAuth redirect (callback) URL:`** — eklemen gereken değer budur.
2. [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → OAuth 2.0 Client ID → **Authorized redirect URIs** → **Add URI** ile aynı adresi yapıştır.
3. Sık hatalar: `https://wordboost.com.tr/auth/google/callback` yazmak (**yanlış**; arada **`/api`** olmalı). `http` ile `https` karıştırmak. Sitede **`www`** kullanıyorsan (`https://www.wordboost.com.tr`) hem **JavaScript origin** hem **redirect URI** için **`www`’lü** adresi ekle ve Railway’de **`FRONTEND_URL`**’i de aynı host ile ver (sonunda `/` yok).
4. Değişiklikten sonra Google tarafında kaydet; tarayıcı önbelleği / gizli pencereden tekrar dene.

#### Sunucu env (Railway)

- `FRONTEND_URL=https://wordboost.com.tr` (sonunda `/` yok)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL` genelde **boş** bırakılır (sunucu `FRONTEND_URL` + `/api/auth/google/callback` üretir).

## Node sürümü

`.nvmrc` ve `package.json` → `engines.node` **>=20**; Vercel Project Settings’te Node 20+ seçili olmalı.

## Yerel

```bash
npm install
npm run build
npx vercel dev
```

`vercel dev` için proje kökünde `.env` veya Vercel env ile `BACKEND_URL` tanımlanmalı.

## Sorun giderme

- **Build Failed (ilk npm install)**: Monorepo kökünde `package.json` olmalı (`YDT/package.json`).
- **502 /api**: `BACKEND_URL` eksik veya yanlış.
- **Socket bağlanmıyor**: `VITE_SOCKET_URL` production build’inde set edilip yeniden deploy edildi mi kontrol et.
