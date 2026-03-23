# WordBoost — e-posta gönderimi

Sıra (özet):

1. **`MAIL_FORCE_SMTP=true`** → Sadece **SMTP** (Gmail vb.), `BREVO_API_KEY` / Resend kullanılmaz.
2. **`MAIL_FORCE_SMTP` kapalı** → **Brevo** (varsa) → **Resend** (varsa, sandbox kısıtına göre) → **SMTP**.

## Brevo (domain gerekmez)

1. [Brevo](https://www.brevo.com) hesabı aç.
2. **SMTP & API** → **API keys** → yeni anahtar oluştur (`xkeysib-...`).
3. **Senders & IP** / **Senders** → gönderici olarak kullanacağın **e-postayı doğrula** (tek adres yeter).
4. Railway / `.env`:

```env
BREVO_API_KEY=xkeysib-xxxxxxxx
BREVO_FROM_EMAIL=senin@dogrulanmis-email.com
BREVO_FROM_NAME=WordBoost
MAIL_FORCE_SMTP=false
```

`BREVO_FROM_EMAIL` yazılmazsa `EMAIL_USER` kullanılır (aynı adres Brevo’da doğrulanmış olmalı).

## Resend (domain ile üretim)

```env
RESEND_API_KEY=re_...
RESEND_FROM=WordBoost <noreply@senindomainin.com>
MAIL_FORCE_SMTP=false
```

`onboarding@resend.dev` sadece test içindir.

## Brevo SMTP (nodemailer ile; API anahtarı şart değil)

Brevo panelinde **SMTP** sekmesindeki değerleri kullan:

```env
EMAIL_HOST=smtp-relay.brevo.com
EMAIL_PORT=587
EMAIL_USER=Brevo_Login_ornegi@smtp-brevo.com
EMAIL_PASS=Brevo_SMTP_sifresi
EMAIL_FROM=WordBoost <dogrulanmis@emailin.com>
MAIL_FORCE_SMTP=true
```

`EMAIL_USER` = Brevo’nun verdiği **Login** (smtp-brevo.com).  
`EMAIL_FROM` = Brevo’da **doğrulanmış gönderici** adresin (genelde Gmail vb.); **Login ile aynı olmak zorunda değil.**

## Gmail SMTP

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=uygulama_sifresi
MAIL_FORCE_SMTP=true
```

Bulut sunucularda (Railway) Gmail sık sık reddedilir; Brevo API genelde daha sorunsuzdur.
