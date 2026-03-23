# Guvenlik notlari

## API anahtarlari ve .env

- **`ydt-kelime/.env` dosyasi git'e eklenmez** (`.gitignore`). Gercek sifreleri burada tut.
- **Railway / Render:** Tum gizli degerleri paneldeki **Variables** bolumune yaz; repoya koyma.
- **Brevo**, GitHub'da public repoda gorunen API anahtarlarini otomatik iptal eder.
- Yeni anahtar urettiginde sadece **Railway Variables** + kendi bilgisayarindaki `.env` guncelle.

## Production'da dotenv

`server.js` icinde Railway veya Render ortaminda **`dotenv` ile dosyadan okuma kapalidir**. Boylece build'e yanlislikla giren `.env` production'da kullanilmaz.

Yerelde calistirirken `RAILWAY_PUBLIC_DOMAIN` olmadigi icin `.env` normal sekilde yuklenir.

## Admin paneli

- `ADMIN_SECRET` (en az 12 karakter) — Railway Variables + yerel `.env`.
- API: isteklere `X-Admin-Key: <ADMIN_SECRET>` header.
- Uygulamada **Yönetim** menüsü; anahtar tarayıcıda `sessionStorage` ile saklanir (sadece o cihaz).
