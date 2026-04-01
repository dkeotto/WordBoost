# Vercel ile deploy (tam uyumluluk)

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

Tüm repoyu Vercel kökü seçtiysen üst dizindeki `vercel.json` devreye girer: `install` / `build` / `output` `ydt-kelime/ydt-kelime-pratigi` altına yönlendirilir; `/api/*` için **`YDT/api/[...path].js`** kullanılır (aynı proxy mantığı `lib/vercelApiProxy.mjs`).

**Özel Build / Install override kullanma** — çakışma yapar. Varsayılan `npm install` + `npm run build` yeterli (kök `package.json` script’leri ile uyumlu).

## Ortam değişkenleri (Vercel)

| Değişken | Build’e gömülür mü | Açıklama |
|----------|-------------------|----------|
| `BACKEND_URL` | Hayır | Zorunlu. Railway Express kök URL’i, **sonunda `/` yok**. |
| `VITE_SOCKET_URL` | Evet | Socket.io **ve** Google OAuth başlatma URL’i; `BACKEND_URL` ile **aynı** Railway kökü olmalı. |
| `VITE_BACKEND_URL` | Evet | İsteğe bağlı; boşsa `VITE_SOCKET_URL` kullanılır (OAuth için aynı amaç). |
| `VITE_ADSENSE_*`, `VITE_PADDLE_CLIENT_TOKEN` | Evet | `.env.example` ile aynı. |

`BACKEND_URL` **`VITE_` öneki almaz**; yalnızca serverless proxy okur.

### Google ile giriş (OAuth)

- Tarayıcı **`https://SENİN-RAILWAY.app/auth/google`** adresine gitmeli (Vercel’de `/auth` yok; bu yüzden `VITE_SOCKET_URL` / `VITE_BACKEND_URL` şart).
- **Google Cloud Console** → OAuth → Yetkili yönlendirme URI: `https://SENİN-RAILWAY.app/auth/google/callback`
- **Railway** → `FRONTEND_URL=https://wordboost.com.tr` (veya kendi domain’in), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` doğru olsun.

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
