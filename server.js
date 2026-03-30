/**
 * Yerel gelistirmede .env kullan. Railway/Render'da sadece platform "Variables"
 * kullanilsin ? boylece repoya yanlislikla giren .env deploy'da okunmaz (Brevo key sizintisi).
 */
if (!process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.RENDER_EXTERNAL_URL) {
  require('dotenv').config();
}

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const os = require('os');

const app = express();

/** Admin özetinde CPU % (process); iki istek arası duvara göre yaklaşık */
let lastCpuSample = { usage: process.cpuUsage(), wallMs: Date.now() };

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildServerMetrics() {
  const now = Date.now();
  const usage = process.cpuUsage();
  const prev = lastCpuSample;
  const wallSec = prev.wallMs ? (now - prev.wallMs) / 1000 : 0;
  const cpuUserDiff = usage.user - prev.usage.user;
  const cpuSysDiff = usage.system - prev.usage.system;
  lastCpuSample = { usage, wallMs: now };

  let processCpuPercent = null;
  if (wallSec > 0.05) {
    const cpuSec = (cpuUserDiff + cpuSysDiff) / 1e6;
    processCpuPercent = Math.min(100, Math.round((cpuSec / wallSec) * 1000) / 10);
  }

  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    externalMb: Math.round(mem.external / 1024 / 1024),
    arrayBuffersMb: mem.arrayBuffers ? Math.round(mem.arrayBuffers / 1024 / 1024) : 0,
    systemTotalMemMb: Math.round(totalMem / 1024 / 1024),
    systemFreeMemMb: Math.round(freeMem / 1024 / 1024),
    systemUsedMemPercent: totalMem > 0 ? Math.round((1 - freeMem / totalMem) * 1000) / 10 : 0,
    processCpuPercent,
    loadAvg: os.loadavg(),
    cpuCores: os.cpus().length,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    nodeVersion: process.version,
    pid: process.pid,
    socketConnections: 0
  };
}
app.set('trust proxy', 1); // Proxy arkas?nda (Render/Railway) ?al??t??? i?in gerekli
const server = http.createServer(app);

// Session Config (Passport i?in gerekli)
app.use(session({
  secret: process.env.SESSION_SECRET || 'gizli_anahtar_session',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' || !!process.env.RENDER_EXTERNAL_URL || !!process.env.RAILWAY_PUBLIC_DOMAIN, 
    sameSite: (process.env.NODE_ENV === 'production' || !!process.env.RENDER_EXTERNAL_URL || !!process.env.RAILWAY_PUBLIC_DOMAIN) ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 saat
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const WordSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaning: { type: String, required: true },
  hint: String,
  example: String,

  level:{
    type:String,
    enum:["A1","A2","B1","B2","C1","C2"],
    default:"B1"
  }

},{timestamps:true})

/** Kelime bazli bilinmiyor / bildim sayaclari (admin analizi) */
const WordStatSchema = new mongoose.Schema(
  {
    term: { type: String, required: true },
    termNorm: { type: String, required: true, unique: true },
    unknownCount: { type: Number, default: 0 },
    knownCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  googleId: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true, sparse: true },
  isVerified: { type: Boolean, default: false }, // Mail do?rulama durumu
  verificationCode: String, // Do?rulama kodu
  verificationCodeExpires: Date, // Kod ge?erlilik s?resi
  password: String,
  nickname: String,
  bio: { type: String, default: "" },
  avatar: { type: String, default: () => `https://api.dicebear.com/7.x/adventurer/svg?seed=${Math.random()}&backgroundColor=b6e3f4,c0aede,d1d4f9` },

  stats: {
    studied: { type: Number, default: 0 },
    known: { type: Number, default: 0 },
    unknown: { type: Number, default: 0 }
  },

  streak: { type: Number, default: 0 },
  lastStudyDate: Date,

  badges: [String],

  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);

// DYNAMIC FRONTEND URL CONFIGURATION
let FRONTEND_URL = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/$/, '') : '';
let BACKEND_URL = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : '';

// Auto-detect Railway
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const railwayUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (!BACKEND_URL) BACKEND_URL = railwayUrl;
  if (!FRONTEND_URL) FRONTEND_URL = railwayUrl;
  console.log("?? Railway Environment Detected");
}

// Auto-detect Render
if (process.env.RENDER_EXTERNAL_URL) {
  const renderUrl = process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  if (!BACKEND_URL) BACKEND_URL = renderUrl;
  if (!FRONTEND_URL) FRONTEND_URL = renderUrl;
  console.log("?? Render Environment Detected");
}

// Defaults
if (!BACKEND_URL) BACKEND_URL = 'http://localhost:3000';
if (!FRONTEND_URL) FRONTEND_URL = 'http://localhost:5173';

console.log("?? Final Configuration:");
console.log(`   - FRONTEND: ${FRONTEND_URL}`);
console.log(`   - BACKEND: ${BACKEND_URL}`);

console.log("?? Google Callback URL:", `${BACKEND_URL}/auth/google/callback`);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "GOOGLE_CLIENT_ID_BURAYA",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "GOOGLE_CLIENT_SECRET_BURAYA",
    callbackURL: `${BACKEND_URL}/auth/google/callback`,
    passReqToCallback: true,
    proxy: true // Railway/Render i?in gerekli
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log("?? Google Profile:", profile.displayName, profile.id);
      
      // 1. ?nce Google ID ile ara
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // 2. Email ile ara (Hesap e?le?tirme)
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (email) {
        user = await User.findOne({ email });
        if (user) {
          // Mevcut hesaba Google ID ekle
          user.googleId = profile.id;
          // E?er avatar yoksa Google avatar?n? ekle
          if (!user.avatar || user.avatar === '??') {
             user.avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatar;
          }
          await user.save();
          return done(null, user);
        }
      }

      // 3. Yeni Kullan?c? Olu?tur
      const baseUsername = email ? email.split('@')[0] : profile.displayName.replace(/\s+/g, '').toLowerCase();
      let finalUsername = baseUsername;
      let counter = 1;
      while (await User.findOne({ username: finalUsername })) {
        finalUsername = `${baseUsername}${counter}`;
        counter++;
      }

      user = await User.create({
        googleId: profile.id,
        username: finalUsername,
        email: email, // Email kaydet
        isVerified: true, // Google ile gelenler otomatik onayl?
        nickname: profile.displayName,
        avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : `https://api.dicebear.com/7.x/adventurer/svg?seed=${finalUsername}&backgroundColor=b6e3f4,c0aede,d1d4f9`,
        badges: [BADGES.NEWBIE.id],
        stats: { studied: 0, known: 0, unknown: 0 },
        streak: 0
      });

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// AUTH ROUTES
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', (req, res, next) => {
  console.log("?? Google Callback Hit:", req.url);
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error("Google Auth Error:", err);
      // Hata durumunda frontend'e y?nlendir
      return res.redirect(`${FRONTEND_URL}/?error=auth_error`);
    }
    if (!user) {
      // Kullan?c? iptal ettiyse veya kullan?c? bulunamad?ysa
      return res.redirect(`${FRONTEND_URL}/?error=auth_cancel`);
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("Login Error:", loginErr);
        return res.redirect(`${FRONTEND_URL}/?error=login_error`);
      }

      // Ba?ar?l? giri?
      const token = jwt.sign(
        { id: user._id, username: user.username },
        "SECRET_KEY",
        { expiresIn: "30d" }
      );

      // FRONTEND_URL'e y?nlendir (Token ile)
      res.redirect(`${FRONTEND_URL}/?token=${token}&username=${user.username}`);
    });
  })(req, res, next);
});

// DELETE PROFILE
app.delete('/api/profile', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(token, "SECRET_KEY");
    const user = await User.findById(decoded.id);

    if (!user) return res.status(404).json({ error: "Kullan?c? bulunamad?" });

    await User.findByIdAndDelete(decoded.id);
    res.json({ success: true, message: "Hesap silindi" });

  } catch (err) {
    res.status(500).json({ error: "Delete error: " + err.message });
  }
});

// BADGE CONSTANTS (UTF-8 Turkish)
const BADGES = {
  NEWBIE: { id: 'newbie', icon: '??', name: 'Yeni Ba?layan', desc: 'Aram?za ho? geldin!' },
  STREAK_3: { id: 'streak_3', icon: '??', name: '3 G?nl?k Seri', desc: '3 g?n ?st ?ste ?al??t?n!' },
  STREAK_7: { id: 'streak_7', icon: '?', name: 'Haftal?k Seri', desc: '7 g?n ?st ?ste ?al??t?n!' },
  STREAK_30: { id: 'streak_30', icon: '??', name: 'Ayl?k Seri', desc: '30 g?n ?st ?ste ?al??t?n! ?nan?lmaz!' },
  KNOWN_100: { id: 'known_100', icon: '??', name: 'Kelime Avc?s?', desc: '100 kelime ??rendin!' },
  KNOWN_500: { id: 'known_500', icon: '??', name: 'Kelime Ustas?', desc: '500 kelime ??rendin!' },
  KNOWN_1000: { id: 'known_1000', icon: '??', name: 'Kelime Kral?', desc: '1000 kelime ??rendin!' },
  NIGHT_OWL: { id: 'night_owl', icon: '??', name: 'Gece Ku?u', desc: 'Gece 00:00 - 05:00 aras? ?al??t?n.' },
  EARLY_BIRD: { id: 'early_bird', icon: '??', name: 'Erkenci Ku?', desc: 'Sabah 05:00 - 09:00 aras? ?al??t?n.' },
  WEEKEND_WARRIOR: { id: 'weekend_warrior', icon: '??', name: 'Hafta Sonu Sava???s?', desc: 'Hafta sonu ?al??may? ihmal etmedin.' }
};

const RoomSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  host: String,
  users: [
    {
      username: String,
      avatar: String,
      studied: { type: Number, default: 0 },
      known: { type: Number, default: 0 },
      unknown: { type: Number, default: 0 }
    }
  ],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Room = mongoose.model("Room", RoomSchema);

const Word = mongoose.model("Word", WordSchema);
const WordStat = mongoose.model("WordStat", WordStatSchema);

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("?? MongoDB connected");
    await ensureMailTransport();

    // CLEANUP GHOST USERS & UNVERIFIED USERS
    try {
      const deleted = await User.deleteMany({
        $or: [
          { username: { $exists: false } },
          { username: null },
          { username: "" },
          { "username": { $type: "string", $regex: /^\s*$/ } }, // sadece bo?luk i?erenler
          { isVerified: false } // Do?rulanmam?? hesaplar? sil
        ]
      });
      if (deleted.deletedCount > 0) {
        console.log(`?? Cleaned up ${deleted.deletedCount} ghost/unverified users`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }

    const PORT = process.env.PORT || 3000;
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`?? Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Mongo connection error:", err);
    process.exit(1);
  }
}

startServer();


// CORS ve transport ayarlar?
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Veri yap?lar?
const rooms = new Map();        // roomCode -> room bilgileri
const roomUsers = new Map();    // socket.id -> { roomCode, username, isHost }
const roomStats = new Map();    // roomCode -> { username: { studied, known, unknown, avatar } }
const roomHosts = new Map();    // roomCode -> hostUsername (g?venlik i?in)

const adminErrorLog = [];
const adminSessions = new Map(); // token -> expiresAt
function pushAdminError(msg, meta = {}) {
  try {
    adminErrorLog.unshift({
      t: new Date().toISOString(),
      msg: String(msg).slice(0, 500),
      ...meta
    });
    if (adminErrorLog.length > 200) adminErrorLog.pop();
  } catch (_) {
    /* ignore */
  }
}

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  const adminToken = req.headers['x-admin-token'];
  if (adminToken && adminSessions.has(adminToken)) {
    const expiresAt = adminSessions.get(adminToken);
    if (Date.now() < expiresAt) {
      return next();
    }
    adminSessions.delete(adminToken);
  }

  // ADMIN_SECRET yoksa sadece token ile izin ver (login ile token üretilir).
  if (!secret || String(secret).length < 12) {
    return res.status(401).json({ error: 'Yetkisiz (ADMIN_SECRET eksik)' });
  }
  if (req.headers['x-admin-key'] !== secret) {
    return res.status(401).json({ error: 'Yetkisiz' });
  }
  next();
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Railway bazen True/1; MAIL_FORCE_SMTP string karsilastirmasi yanlis sonuc vermesin */
function envIsTrue(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

/** Gmail app sifresi genelde 16 karakter; aradaki bosluklar SMTP'de hata yapabiliyor */
const SMTP_USER = String(process.env.EMAIL_USER || '').trim();
const SMTP_PASS = String(process.env.EMAIL_PASS || '').replace(/\s+/g, '').trim();

/** Brevo SMTP: auth kullanici genelde xxx@smtp-brevo.com; From ayri dogrulanmis adres olmali */
function smtpFromHeader() {
  const raw = String(process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim();
  if (raw) {
    return raw.replace(/^["']+|["']+$/g, '');
  }
  return `"WordBoost" <${SMTP_USER}>`;
}

// NODEMAILER CONFIG (SMTP fallback; Railway/Render IP'lerinde Gmail bazen reddeder)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: process.env.NODE_ENV !== 'production',
  logger: process.env.NODE_ENV !== 'production'
});

const MAIL_SEND_TIMEOUT_MS = 15000;

/**
 * Resend HTTP API (?nerilen: bulut sunucularda SMTP yerine daha g?venilir teslimat)
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendMailViaResend({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'RESEND_API_KEY not set' };
  }

  const from = process.env.RESEND_FROM || 'WordBoost <onboarding@resend.dev>';

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), MAIL_SEND_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text: text || undefined
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Resend API error:', res.status, data);
      return {
        success: false,
        error: data.message || data.name || `Resend ${res.status}`
      };
    }

    console.log('Resend mail sent:', data.id);
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error('Resend request failed:', err);
    return { success: false, error: err.message || 'Resend failed' };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Brevo (Sendinblue) Transactional API
 * Domain gerekmez: app.brevo.com -> Senders & IP -> gonderici e-postayi dogrula
 * https://developers.brevo.com/reference/sendtransacemail
 */
function brevoSenderEmail() {
  return String(process.env.BREVO_FROM_EMAIL || process.env.EMAIL_USER || SMTP_USER || '').trim();
}

async function sendMailViaBrevo({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'BREVO_API_KEY not set' };
  }

  const fromEmail = brevoSenderEmail();
  const fromName = String(process.env.BREVO_FROM_NAME || 'WordBoost').trim();

  if (!fromEmail) {
    return {
      success: false,
      error: 'BREVO_FROM_EMAIL veya EMAIL_USER (gonderici) ayarla; Brevo panelinde bu adresi dogrula'
    };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), MAIL_SEND_TIMEOUT_MS);

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || undefined
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error('Brevo API error:', res.status, data);
      return {
        success: false,
        error: data.message || data.code || `Brevo ${res.status}`
      };
    }

    console.log('Brevo mail sent:', data.messageId);
    return { success: true, messageId: data.messageId };
  } catch (err) {
    console.error('Brevo request failed:', err);
    return { success: false, error: err.message || 'Brevo failed' };
  } finally {
    clearTimeout(t);
  }
}

console.log(
  '[Mail] MAIL_FORCE_SMTP=%s | BREVO_API_KEY=%s | BREVO_FROM_EMAIL=%s',
  envIsTrue('MAIL_FORCE_SMTP') ? 'true (Brevo/Resend API atlanir, sadece SMTP)' : 'false/empty',
  process.env.BREVO_API_KEY ? 'set' : 'MISSING',
  brevoSenderEmail() || '(bos ? BREVO_FROM_EMAIL veya EMAIL_USER gerek)'
);

/**
 * onboarding@resend.dev = Resend "sandbox" gonderici; sadece hesapta dogrulanmis
 * alici adreslerine izin verir. Gercek kullanicilara mail icin domain dogrula veya SMTP kullan.
 */
function shouldSkipResendSandbox() {
  const from = (process.env.RESEND_FROM || '').toLowerCase();
  return from.includes('onboarding@resend.dev');
}

async function sendVerificationEmail(email, username, code) {
  console.log(`Sending verification email to ${email}...`);

  // Unicode escapes: e-posta istemcilerinde UTF-8 dogru gorunsun (kaynak dosya kodlamasindan bagimsiz)
  const subject = 'WordBoost \u2014 Do\u011frulama kodu';
  const text = `Merhaba ${username},

Hesab\u0131n\u0131 do\u011frulamak i\u00E7in kodun: ${code}

Bu kod 1 saat s\u00FCreyle ge\u00E7erlidir.

\u2014 WordBoost`;
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta charset="utf-8" />
</head>
<body style="margin:0;padding:0;background:#fafafa;">
        <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; padding: 24px; color: #333; max-width: 560px;">
          <h2 style="color: #FF9F1C;">WordBoost</h2>
          <p>Merhaba <strong>${username}</strong>,</p>
          <p>Hesab\u0131n\u0131 do\u011frulamak i\u00E7in a\u015fa\u011f\u0131daki kodu kullanabilirsin:</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #333;">
            ${code}
          </div>
          <p>Bu kod 1 saat s\u00FCreyle ge\u00E7erlidir.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">Bu i\u015Flemi sen yapmad\u0131ysan bu e-postay\u0131 yok sayabilirsin.</p>
        </div>
</body>
</html>`;

  // Zorunlu SMTP (Gmail vb.) ? Brevo/Resend kullanma
  if (envIsTrue('MAIL_FORCE_SMTP')) {
    if (!SMTP_USER || !SMTP_PASS) {
      console.error('SMTP skipped: EMAIL_USER / EMAIL_PASS not set');
      return { success: false, error: 'No mail provider configured (set BREVO_API_KEY, RESEND_API_KEY or EMAIL_*)' };
    }
    const mailPromise = transporter.sendMail({
      from: smtpFromHeader(),
      to: email,
      subject,
      text,
      html
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP timeout')), MAIL_SEND_TIMEOUT_MS)
    );
    try {
      const info = await Promise.race([mailPromise, timeoutPromise]);
      console.log('SMTP mail sent:', info.messageId);
      const accepted = Array.isArray(info.accepted) ? info.accepted : [];
      const rejected = Array.isArray(info.rejected) ? info.rejected : [];
      if (!accepted.includes(email)) {
        return {
          success: false,
          error: `SMTP rejected: ${rejected.join(', ') || 'unknown'}`
        };
      }
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('SMTP send failed:', error);
      return { success: false, error: error.message || 'Mail sending failed' };
    }
  }

  // 1) Brevo ? domain gerekmez; gonderici Brevo'da dogrulanmis olmali
  // 2) Resend ? yedek
  // BREVO_API_KEY varken basarisizlikta Gmail SMTP'ye DUSME (Railway'de timeout + yaniltici "SMTP timeout")
  const skipResend = shouldSkipResendSandbox() && SMTP_USER && SMTP_PASS;
  let lastMailError = null;

  if (process.env.BREVO_API_KEY) {
    const br = await sendMailViaBrevo({ to: email, subject, html, text });
    if (br.success) return br;
    lastMailError = br.error;
    console.warn('Brevo failed:', br.error);
  }

  if (process.env.RESEND_API_KEY && !skipResend) {
    const resendResult = await sendMailViaResend({ to: email, subject, html, text });
    if (resendResult.success) return resendResult;
    lastMailError = resendResult.error;
    console.warn('Resend failed:', resendResult.error);
  } else if (skipResend && shouldSkipResendSandbox()) {
    console.log('Skipping Resend (onboarding@resend.dev sandbox); using SMTP for all recipients.');
  }

  if (process.env.BREVO_API_KEY) {
    return {
      success: false,
      error:
        lastMailError ||
        'Brevo failed. Panelde API anahtarini etkinlestir (Transactional / Send emails).'
    };
  }

  // 3) SMTP (Gmail vb.) ? sadece BREVO_API_KEY yokken
  if (!SMTP_USER || !SMTP_PASS) {
    console.error('SMTP skipped: EMAIL_USER / EMAIL_PASS not set');
    return { success: false, error: 'No mail provider configured (set BREVO_API_KEY, RESEND_API_KEY or EMAIL_*)' };
  }

  const mailPromise = transporter.sendMail({
    from: smtpFromHeader(),
    to: email,
    subject,
    text,
    html
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('SMTP timeout')), MAIL_SEND_TIMEOUT_MS)
  );

  try {
    const info = await Promise.race([mailPromise, timeoutPromise]);
    console.log('SMTP mail sent:', info.messageId);
    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];
    if (!accepted.includes(email)) {
      return {
        success: false,
        error: `SMTP rejected: ${rejected.join(', ') || 'unknown'}`
      };
    }
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('SMTP send failed:', error);
    return { success: false, error: error.message || 'Mail sending failed' };
  }
}


let mailTransportVerified = false;

async function ensureMailTransport() {
  if (mailTransportVerified) return true;

  try {
    await transporter.verify();
    mailTransportVerified = true;
    console.log("Mail transport ready");
    return true;
  } catch (error) {
    console.error("Mail transport verification failed:", error);
    return false;
  }
}

async function sendPasswordResetEmail(email, resetCode) {
  const subject = 'WordBoost \u2014 \u015Eifre s\u0131f\u0131rlama';
  const text = `Merhaba,

\u015Eifreni s\u0131f\u0131rlamak i\u00E7in kodun: ${resetCode}

Bu kod 1 saat s\u00FCreyle ge\u00E7erlidir.

\u2014 WordBoost`;
  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta charset="utf-8" />
</head>
<body style="margin:0;padding:0;background:#fafafa;">
    <div style="font-family: 'Segoe UI', Arial, Helvetica, sans-serif; padding: 24px; color: #333; max-width: 560px;">
      <h2 style="color: #FF9F1C;">\u015Eifre s\u0131f\u0131rlama</h2>
      <p>\u015Eifreni s\u0131f\u0131rlamak i\u00E7in a\u015fa\u011f\u0131daki kodu kullan:</p>
      <div style="background: #f4f4f4; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center;">${resetCode}</div>
      <p style="font-size: 12px; color: #999; margin-top: 16px;">Bu kod 1 saat s\u00FCreyle ge\u00E7erlidir.</p>
      <p style="font-size: 12px; color: #999;">Bu i\u015Flemi sen yapmad\u0131ysan bu e-postay\u0131 yok sayabilirsin.</p>
    </div>
</body>
</html>`;

  if (envIsTrue('MAIL_FORCE_SMTP')) {
    if (!SMTP_USER || !SMTP_PASS) {
      return { success: false, error: 'No mail provider configured' };
    }
    const transportOk = await ensureMailTransport();
    if (!transportOk) {
      return { success: false, error: 'Mail transport is not ready' };
    }
    try {
      const info = await transporter.sendMail({
        from: smtpFromHeader(),
        to: email,
        subject,
        text,
        html
      });
      const accepted = Array.isArray(info.accepted) ? info.accepted : [];
      const rejected = Array.isArray(info.rejected) ? info.rejected : [];
      if (!accepted.includes(email)) {
        return {
          success: false,
          error: `SMTP rejected: ${rejected.join(', ') || 'unknown'}`
        };
      }
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Password reset mail failed:', error);
      return { success: false, error: error.message || 'Mail sending failed' };
    }
  }

  const skipResend = shouldSkipResendSandbox() && SMTP_USER && SMTP_PASS;
  let lastPwMailError = null;

  if (process.env.BREVO_API_KEY) {
    const br = await sendMailViaBrevo({ to: email, subject, html, text });
    if (br.success) return br;
    lastPwMailError = br.error;
    console.warn('Brevo password reset failed:', br.error);
  }

  if (process.env.RESEND_API_KEY && !skipResend) {
    const r = await sendMailViaResend({ to: email, subject, html, text });
    if (r.success) return r;
    lastPwMailError = r.error;
    console.warn('Resend password reset failed:', r.error);
  }

  if (process.env.BREVO_API_KEY) {
    return {
      success: false,
      error:
        lastPwMailError ||
        'Brevo failed. Panelde API anahtarini etkinlestir (Transactional / Send emails).'
    };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    return { success: false, error: 'No mail provider configured' };
  }

  const transportOk = await ensureMailTransport();
  if (!transportOk) {
    return { success: false, error: 'Mail transport is not ready' };
  }

  try {
    const info = await transporter.sendMail({
      from: smtpFromHeader(),
      to: email,
      subject,
      text,
      html
    });

    const accepted = Array.isArray(info.accepted) ? info.accepted : [];
    const rejected = Array.isArray(info.rejected) ? info.rejected : [];

    if (!accepted.includes(email)) {
      return {
        success: false,
        error: `SMTP rejected: ${rejected.join(', ') || 'unknown'}`
      };
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Password reset mail failed:', error);
    return { success: false, error: error.message || 'Mail sending failed' };
  }
}

function normalizeEmail(s) {
  return String(s || '').trim().toLowerCase();
}

function normalizeVerificationCode(code) {
  return String(code || '').replace(/\s/g, '');
}

/** Email buyuk/kucuk harf farkiyle DB'de bulunamama sorununu cozer */
async function findUserByEmail(emailRaw) {
  const emailNorm = normalizeEmail(emailRaw);
  if (!emailNorm || !emailNorm.includes('@')) return null;
  return User.findOne({
    $expr: { $eq: [{ $toLower: '$email' }, emailNorm] }
  });
}

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const emailNorm = normalizeEmail(email);
    const usernameTrim = String(username || '').trim();

    if (!usernameTrim || !emailNorm || !password) {
      return res.status(400).json({ error: 'Kullanici adi, email ve sifre gerekli' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailNorm)) {
      return res.status(400).json({ error: 'Gecersiz email formati' });
    }

    let user = await User.findOne({ username: usernameTrim });
    if (!user) user = await findUserByEmail(emailNorm);

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = await bcrypt.hash(password, 10);

    if (user) {
      if (!user.isVerified) {
        user.username = usernameTrim;
        user.email = emailNorm;
        user.password = hashed;
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = Date.now() + 3600000;
        await user.save();

        const mailResult = await sendVerificationEmail(emailNorm, usernameTrim, verificationCode);
        if (mailResult.success) {
          return res.json({
            success: true,
            requireVerification: true,
            email: emailNorm,
            message: 'verification_code_sent'
          });
        }

        console.error('Register re-send mail error:', mailResult.error);
        return res.status(503).json({
          success: false,
          error: 'verification_mail_failed',
          detail: mailResult.error || 'unknown'
        });
      }

      if (normalizeEmail(user.email) === emailNorm) {
        return res.status(400).json({ error: 'Email zaten kullaniliyor' });
      }
      return res.status(400).json({ error: 'Kullanici adi zaten kullaniliyor' });
    }

    user = await User.create({
      username: usernameTrim,
      email: emailNorm,
      password: hashed,
      nickname: usernameTrim,
      badges: [BADGES.NEWBIE.id],
      isVerified: false,
      verificationCode,
      verificationCodeExpires: Date.now() + 3600000 // 1 saat ge?erli
    });

    const mailResult = await sendVerificationEmail(emailNorm, usernameTrim, verificationCode);

    if (mailResult.success) {
      return res.json({
        success: true,
        requireVerification: true,
        email: emailNorm,
        message: 'verification_code_sent'
      });
    }

    console.error('Register mail error:', mailResult.error);
    return res.status(503).json({
      success: false,
      error: "verification_mail_failed",
      detail: mailResult.error || "unknown"
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Register error" });
  }
});

// FORGOT PASSWORD
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await findUserByEmail(email);

    if (!user) {
      // G?venlik: Kullan?c? yoksa bile "g?nderildi" de (User enumeration prevention)
      // Ama user experience i?in ?imdilik hata d?nelim
      return res.status(404).json({ error: "Bu email ile kay?tl? kullan?c? bulunamad?" });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = resetCode; // Reuse verification code field
    user.verificationCodeExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const mailResult = await sendPasswordResetEmail(user.email, resetCode);

    if (!mailResult.success) {
      return res.status(500).json({ error: "?ifre s?f?rlama maili g?nderilemedi" });
    }


    res.json({ success: true, message: "S?f?rlama kodu g?nderildi" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error sending email" });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await findUserByEmail(email);

    if (!user) return res.status(404).json({ error: 'Kullanici bulunamadi' });

    const codeNorm = normalizeVerificationCode(code);
    if (user.verificationCode !== codeNorm || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: 'Gecersiz veya suresi dolmus kod' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ success: true, message: "?ifre ba?ar?yla g?ncellendi" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reset error" });
  }
});

app.post('/api/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    const emailNorm = normalizeEmail(email);
    const codeNorm = normalizeVerificationCode(code);

    if (!emailNorm || !codeNorm) {
      return res.status(400).json({ error: 'Email ve kod gerekli' });
    }

    const user = await findUserByEmail(emailNorm);

    if (!user) return res.status(400).json({ error: 'Kullanici bulunamadi' });
    if (user.isVerified) return res.status(400).json({ error: 'Hesap zaten dogrulanmis' });

    if (user.verificationCode !== codeNorm || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: 'Gecersiz veya suresi dolmus kod' });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      "SECRET_KEY",
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        bio: user.bio,
        stats: user.stats,
        streak: user.streak,
        badges: user.badges
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification error" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const loginId = String(username || '').trim();

    let user = await User.findOne({ username: loginId });
    if (!user) user = await findUserByEmail(loginId);

    if (!user) {
      return res.status(400).json({ error: 'Kullanici bulunamadi' });
    }

    // ?ifre kontrol?
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "?ifre yanl??" });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        requireVerification: true,
        email: user.email,
        error: "email_not_verified"
      });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username },
      "SECRET_KEY",
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: {
        username: user.username,
        nickname: user.nickname || user.username,
        avatar: user.avatar || "??",
        bio: user.bio || "",
        stats: user.stats,
        streak: user.streak,
        badges: user.badges
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login error" });
  }
});
app.get('/api/profile', async (req, res) => {
  try {
    const token = req.headers.authorization;

    if (!token) {
      return res.status(401).json({ error: "Token gerekli" });
    }

    const decoded = jwt.verify(token, "SECRET_KEY");

    const user = await User.findById(decoded.id);

    res.json({
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar || "??",
      bio: user.bio || "",
      stats: user.stats,
      streak: user.streak,
      badges: user.badges,
      createdAt: user.createdAt
    });

  } catch (err) {
    res.status(401).json({ error: "Auth error" });
  }
});

app.post('/api/profile/update', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(token, "SECRET_KEY");
    const { nickname, bio, avatar, username } = req.body;

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullan?c? bulunamad?" });

    // Username de?i?imi ve unique kontrol?
    if (username && username !== user.username) {
      // Format kontrol? (bo?luk olmamal?, min 3 karakter)
      if (username.length < 3 || /\s/.test(username)) {
        return res.status(400).json({ error: "Kullan?c? ad? en az 3 karakter olmal? ve bo?luk i?ermemelidir." });
      }

      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(400).json({ error: "Bu kullan?c? ad? zaten al?nm??." });
      }
      user.username = username;
    }

    if (nickname) user.nickname = nickname;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;

    await user.save();

    res.json({ success: true, user: { 
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      bio: user.bio,
      stats: user.stats,
      streak: user.streak,
      badges: user.badges
    }});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update error: " + err.message });
  }
});

app.get('/api/users/search', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.json([]);

    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { nickname: { $regex: q, $options: 'i' } }
      ]
    })
    .select("username nickname avatar stats streak badges")
    .limit(10);

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Search error" });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("username nickname avatar bio stats streak badges createdAt");
    
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Profile fetch error" });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    // STREAK'e g?re s?rala (?nce en y?ksek seri, sonra en ?ok bilinen kelime)
    const users = await User.find({
      username: { $exists: true, $ne: "" },
      "stats.known": { $exists: true },
      isVerified: true // Sadece do?rulanm?? kullan?c?lar
    })
      .sort({ "streak": -1, "stats.known": -1 }) // ?nce seri, sonra puan
      .limit(50)
      .select("username nickname avatar stats badges streak");

    // Bo? kullan?c?lar? filtrele (ek g?venlik)
    const filteredUsers = users.filter(u => u.username && u.username.trim().length > 0);

    res.json(filteredUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Leaderboard error" });
  }
});

app.post('/api/stats/update', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(token, "SECRET_KEY");
    const { studied, known, unknown, wordTerm } = req.body;

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullan?c? bulunamad?" });

    // Stats g?ncelle
    if (studied) user.stats.studied += studied;
    if (known) user.stats.known += known;
    if (unknown) user.stats.unknown += unknown;

    if (wordTerm && typeof wordTerm === 'string') {
      const tn = wordTerm.trim().toLowerCase();
      if (tn.length > 0 && tn.length < 200) {
        try {
          if (unknown) {
            await WordStat.findOneAndUpdate(
              { termNorm: tn },
              { $inc: { unknownCount: 1 }, $setOnInsert: { term: wordTerm.trim() } },
              { upsert: true }
            );
          } else if (known) {
            await WordStat.findOneAndUpdate(
              { termNorm: tn },
              { $inc: { knownCount: 1 }, $setOnInsert: { term: wordTerm.trim() } },
              { upsert: true }
            );
          }
        } catch (e) {
          console.error('WordStat update:', e);
          pushAdminError(e.message, { where: 'WordStat' });
        }
      }
    }

    // Streak Logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
    if (lastStudy) lastStudy.setHours(0, 0, 0, 0);

    if (!lastStudy) {
      // ?lk defa ?al???yor
      user.streak = 1;
      user.lastStudyDate = new Date();
    } else if (today.getTime() === lastStudy.getTime()) {
      // Bug?n zaten ?al??m??, streak de?i?mez
      user.lastStudyDate = new Date();
    } else if (today.getTime() === lastStudy.getTime() + 86400000) {
      // D?n ?al??m??, streak artar
      user.streak += 1;
      user.lastStudyDate = new Date();
    } else {
      // D?nden ?nce ?al??m??, streak s?f?rlan?r (veya 1 olur)
      user.streak = 1;
      user.lastStudyDate = new Date();
    }

    // Badge Logic
    const newBadges = [];
    const checkBadge = (id, condition) => {
      if (condition && !user.badges.includes(id)) {
        user.badges.push(id);
        newBadges.push(BADGES[Object.keys(BADGES).find(k => BADGES[k].id === id)]);
      }
    };

    checkBadge(BADGES.STREAK_3.id, user.streak >= 3);
    checkBadge(BADGES.STREAK_7.id, user.streak >= 7);
    checkBadge(BADGES.STREAK_30.id, user.streak >= 30);
    checkBadge(BADGES.KNOWN_100.id, user.stats.known >= 100);
    checkBadge(BADGES.KNOWN_500.id, user.stats.known >= 500);
    checkBadge(BADGES.KNOWN_1000.id, user.stats.known >= 1000);

    // Time based badges
    const hour = new Date().getHours();
    const day = new Date().getDay(); // 0 = Sunday, 6 = Saturday

    if (hour >= 0 && hour < 5) checkBadge(BADGES.NIGHT_OWL.id, true);
    if (hour >= 5 && hour < 9) checkBadge(BADGES.EARLY_BIRD.id, true);
    if (day === 0 || day === 6) checkBadge(BADGES.WEEKEND_WARRIOR.id, true);

    await user.save();

    res.json({ 
      success: true, 
      stats: user.stats, 
      streak: user.streak, 
      badges: user.badges,
      newBadges 
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stats update error" });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { username, avatar } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username gerekli" });
    }

    const roomCode = generateRoomCode();

    const newRoom = await Room.create({
      code: roomCode,
      host: username,
      users: [{
        username,
        avatar: avatar || "??",
        studied: 0,
        known: 0,
        unknown: 0
      }],
      isActive: true
    });

    res.json({
      success: true,
      roomCode: newRoom.code
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Room olu?turulamad?" });
  }
});

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({ status: 'OK', db: dbStatus, timestamp: new Date() });
});

app.get('/api/words', async (req, res) => {
  try {
    console.log("Fetching words...");
    // Sadece practice/list için gerekli alanları çekiyoruz.
    const words = await Word.find()
      .select('term meaning hint example level')
      .lean()
      .sort({ term: 1 })
      .maxTimeMS(5000);
    console.log(`Fetched ${words.length} words.`);
    res.json(words);
  } catch (err) {
    console.error("WORD FETCH ERROR:", err); 
    pushAdminError(err.message, { path: '/api/words' });
    res.status(500).json({ error: "Database error: " + err.message });
  }
});

// --- Admin (ADMIN_SECRET + header X-Admin-Key) ---
app.post('/api/admin/login', (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    const expectedUser = String(process.env.ADMIN_USERNAME || 'dkeotto');
    const expectedPass = String(process.env.ADMIN_PASSWORD || 'doruk1907');

    if (username !== expectedUser || password !== expectedPass) {
      return res.status(401).json({ error: 'Kullanici adi veya sifre hatali' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const ttlMs = 1000 * 60 * 60 * 8; // 8 saat
    adminSessions.set(token, Date.now() + ttlMs);
    res.json({ ok: true, token, expiresInMs: ttlMs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  try {
    const [userCount, wordCount, statCount] = await Promise.all([
      User.countDocuments(),
      Word.countDocuments(),
      WordStat.countDocuments()
    ]);
    const serverMetrics = buildServerMetrics();
    try {
      serverMetrics.socketConnections = io.engine.clientsCount ?? 0;
    } catch (_) {
      serverMetrics.socketConnections = 0;
    }
    res.json({
      ok: true,
      userCount,
      wordCount,
      wordStatDocuments: statCount,
      uptimeSec: Math.floor(process.uptime()),
      rssMb: serverMetrics.rssMb,
      serverMetrics,
      recentErrors: adminErrorLog.slice(0, 40)
    });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/summary' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users/meta', requireAdmin, async (req, res) => {
  try {
    const [
      total,
      withEmail,
      verified,
      googleLinked,
      withPassword
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ email: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ googleId: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({ password: { $exists: true, $nin: [null, ''] } })
    ]);
    res.json({
      ok: true,
      total,
      withEmail,
      verified,
      googleLinked,
      withPassword
    });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/users/meta' });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25));
    const q = String(req.query.q || '').trim();
    const sortField = ['createdAt', 'username', 'lastStudyDate', 'streak'].includes(req.query.sort)
      ? req.query.sort
      : 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;

    const conditions = [];
    if (q) {
      const rx = escapeRegex(q);
      conditions.push({
        $or: [
          { username: { $regex: rx, $options: 'i' } },
          { nickname: { $regex: rx, $options: 'i' } },
          { email: { $regex: rx, $options: 'i' } }
        ]
      });
    }
    if (req.query.verified === 'true') conditions.push({ isVerified: true });
    if (req.query.verified === 'false') conditions.push({ isVerified: false });
    if (req.query.oauth === 'google') {
      conditions.push({ googleId: { $exists: true, $nin: [null, ''] } });
    }
    if (req.query.oauth === 'local') {
      conditions.push({
        $or: [{ googleId: { $exists: false } }, { googleId: null }, { googleId: '' }]
      });
    }

    const filter = conditions.length === 0 ? {} : { $and: conditions };

    const skip = (page - 1) * limit;
    const [total, raw] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ [sortField]: order })
        .skip(skip)
        .limit(limit)
        .select('-verificationCode -verificationCodeExpires')
        .lean()
    ]);

    const items = raw.map((u) => {
      const hasPassword = Boolean(u.password && String(u.password).length > 0);
      return {
      _id: u._id,
      username: u.username,
      nickname: u.nickname || '',
      email: u.email || null,
      isVerified: Boolean(u.isVerified),
      hasGoogle: Boolean(u.googleId),
      hasPassword,
      bio: u.bio || '',
      avatar: u.avatar || '',
      stats: u.stats || { studied: 0, known: 0, unknown: 0 },
      streak: u.streak ?? 0,
      lastStudyDate: u.lastStudyDate || null,
      badges: (u.badges || []).slice(0, 30),
      createdAt: u.createdAt || null
    };
    });

    res.json({
      ok: true,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/users' });
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id/stats', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id gerekli' });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    const body = req.body || {};
    const nextStats = body.stats || {};

    const clampInt = (v, name) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${name} sayı olmalı`);
      const i = Math.trunc(n);
      if (i < 0) throw new Error(`${name} negatif olamaz`);
      if (i > 10_000_000) throw new Error(`${name} çok büyük`);
      return i;
    };

    const studied = clampInt(nextStats.studied, 'stats.studied');
    const known = clampInt(nextStats.known, 'stats.known');
    const unknown = clampInt(nextStats.unknown, 'stats.unknown');
    const streak = clampInt(body.streak, 'streak');

    if (studied !== undefined) user.stats.studied = studied;
    if (known !== undefined) user.stats.known = known;
    if (unknown !== undefined) user.stats.unknown = unknown;
    if (streak !== undefined) user.streak = streak;

    if (Object.prototype.hasOwnProperty.call(body, 'lastStudyDate')) {
      const v = body.lastStudyDate;
      if (v === null || v === '' || v === false) {
        user.lastStudyDate = null;
      } else {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) throw new Error('lastStudyDate geçersiz tarih');
        user.lastStudyDate = d;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'badges')) {
      const badges = Array.isArray(body.badges) ? body.badges : [];
      const cleaned = badges
        .map((x) => String(x || '').trim())
        .filter((x) => x && x.length <= 64)
        .slice(0, 120);
      user.badges = cleaned;
    }

    await user.save();
    res.json({
      ok: true,
      user: {
        _id: user._id,
        username: user.username,
        stats: user.stats,
        streak: user.streak,
        lastStudyDate: user.lastStudyDate || null,
        badges: user.badges || []
      }
    });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/users/:id/stats' });
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/admin/word-difficulty', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 50));
    const sort = req.query.sort === 'known' ? 'knownCount' : 'unknownCount';
    const top = await WordStat.find()
      .sort({ [sort]: -1 })
      .limit(limit)
      .lean();
    res.json({ ok: true, sort, items: top });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/levels', requireAdmin, async (req, res) => {
  try {
    const levels = ["A1", "A2", "B1", "B2", "C1", "C2"];
    const raw = await Word.aggregate([
      { $group: { _id: "$level", count: { $sum: 1 } } }
    ]);
    const map = new Map(raw.map((x) => [x._id, x.count]));
    const items = levels.map((lv) => ({ level: lv, count: map.get(lv) || 0 }));
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/activity', requireAdmin, async (req, res) => {
  try {
    const days = Math.min(60, Math.max(1, parseInt(req.query.days, 10) || 7));
    const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 50));

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const activeUsers = await User.find({ lastStudyDate: { $gte: since } })
      .sort({ lastStudyDate: -1 })
      .limit(limit)
      .select("username nickname avatar stats streak lastStudyDate badges")
      .lean();

    const activeCount = await User.countDocuments({ lastStudyDate: { $gte: since } });

    // Streak histogram (bucket'lar)
    const streakBucketsRaw = await User.aggregate([
      {
        $bucket: {
          groupBy: "$streak",
          boundaries: [0, 1, 3, 7, 14, 30, 60, 100, 200],
          default: "200+",
          output: { count: { $sum: 1 } }
        }
      }
    ]);

    const streakBuckets = (streakBucketsRaw || []).map((b) => ({
      streak: String(b._id),
      count: b.count || 0
    }));

    res.json({
      ok: true,
      days,
      sinceISO: since.toISOString(),
      activeCount,
      activeUsers,
      streakBuckets
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/word-quality', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 20));

    const totals = await WordStat.aggregate([
      {
        $group: {
          _id: null,
          sumKnown: { $sum: "$knownCount" },
          sumUnknown: { $sum: "$unknownCount" },
          wordStatDocuments: { $sum: 1 }
        }
      }
    ]);

    const t = totals?.[0] || { sumKnown: 0, sumUnknown: 0, wordStatDocuments: 0 };
    const totalAnswers = (t.sumKnown || 0) + (t.sumUnknown || 0);
    const successRate = totalAnswers > 0 ? (t.sumKnown / totalAnswers) : 0;

    const hardest = await WordStat.aggregate([
      {
        $addFields: {
          total: { $add: ["$knownCount", "$unknownCount"] },
          unknownRatio: {
            $cond: [
              { $eq: [{ $add: ["$knownCount", "$unknownCount"] }, 0] },
              0,
              { $divide: ["$unknownCount", { $add: ["$knownCount", "$unknownCount"] }] }
            ]
          }
        }
      },
      { $match: { total: { $gt: 0 } } },
      { $sort: { unknownRatio: -1, unknownCount: -1 } },
      { $limit: limit },
      { $project: { term: 1, termNorm: 1, unknownCount: 1, knownCount: 1, unknownRatio: 1 } }
    ]);

    const easiest = await WordStat.aggregate([
      {
        $addFields: {
          total: { $add: ["$knownCount", "$unknownCount"] },
          knownRatio: {
            $cond: [
              { $eq: [{ $add: ["$knownCount", "$unknownCount"] }, 0] },
              0,
              { $divide: ["$knownCount", { $add: ["$knownCount", "$unknownCount"] }] }
            ]
          }
        }
      },
      { $match: { total: { $gt: 0 } } },
      { $sort: { knownRatio: -1, knownCount: -1 } },
      { $limit: limit },
      { $project: { term: 1, termNorm: 1, unknownCount: 1, knownCount: 1, knownRatio: 1 } }
    ]);

    res.json({
      ok: true,
      successRate,
      totals: {
        sumKnown: t.sumKnown || 0,
        sumUnknown: t.sumUnknown || 0,
        wordStatDocuments: t.wordStatDocuments || 0
      },
      hardest,
      easiest
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/words', requireAdmin, async (req, res) => {
  try {
    const { term, meaning, hint, example, level } = req.body;
    if (!term || !meaning) {
      return res.status(400).json({ error: 'term ve meaning zorunlu' });
    }
    const lv = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level) ? level : 'B1';
    const doc = await Word.create({
      term: String(term).trim(),
      meaning: String(meaning).trim(),
      hint: hint ? String(hint) : '',
      example: example ? String(example) : '',
      level: lv
    });
    res.json({ ok: true, word: doc });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ error: 'Bu kelime zaten var (duplicate)' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/words/import', requireAdmin, async (req, res) => {
  try {
    const raw = req.body.csv || req.body.text || '';
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'csv veya text alani gerekli (JSON)' });
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 1) {
      return res.status(400).json({ error: 'Bos CSV' });
    }
    const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/^\uFEFF/, ''));
    const hasHeader =
      header.includes('term') && header.includes('meaning');
    let start = 0;
    let col = { term: 0, meaning: 1, hint: 2, example: 3, level: 4 };
    if (hasHeader) {
      col.term = header.indexOf('term');
      col.meaning = header.indexOf('meaning');
      col.hint = header.indexOf('hint');
      col.example = header.indexOf('example');
      col.level = header.indexOf('level');
      start = 1;
    }
    let inserted = 0;
    let skipped = 0;
    const errors = [];
    for (let i = start; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const term = cells[col.term];
      const meaning = cells[col.meaning];
      if (!term || !meaning) {
        skipped++;
        continue;
      }
      const hint = col.hint >= 0 ? cells[col.hint] || '' : '';
      const example = col.example >= 0 ? cells[col.example] || '' : '';
      let level = col.level >= 0 ? cells[col.level] || 'B1' : 'B1';
      if (!['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(level)) level = 'B1';
      try {
        await Word.create({
          term: term.trim(),
          meaning: meaning.trim(),
          hint: String(hint).trim(),
          example: String(example).trim(),
          level
        });
        inserted++;
      } catch (e) {
        if (e.code === 11000) skipped++;
        else errors.push({ line: i + 1, msg: e.message });
      }
    }
    res.json({ ok: true, inserted, skipped, errorCount: errors.length, errors: errors.slice(0, 20) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/rooms/:code', async (req, res) => {
  const room = await Room.findOne({ code: req.params.code });

  if (room && room.isActive) {
    res.json({ success: true, room });
  } else {
    res.status(404).json({ success: false, error: 'Room not found' });
  }
});
// T?M KEL?MELER? GET?R

// Yard?mc? fonksiyon: Oda kullan?c?lar?n? stats'tan olu?tur
function getUsersFromStats(roomCode) {
  const stats = roomStats.get(roomCode) || {};
  const hostName = roomHosts.get(roomCode);
  
  return Object.entries(stats).map(([username, userStat]) => ({
    username: username,
    isHost: hostName === username,
    avatar: userStat.avatar || '??',
    studied: userStat.studied || 0,
    known: userStat.known || 0
  }));
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('? User connected:', socket.id);
 
  // ODA OLU?TURMA - Host burada belirlenir!
  socket.on('create-room', async ({ username, avatar }, callback) => {
  try {

    if (!username || username.trim().length < 2) {
      callback?.({ success: false, error: 'Ge?erli kullan?c? ad? girin' });
      return;
    }

    const roomCode = generateRoomCode();
    const userAvatar = avatar || '??';

    console.log("Mongo'ya room yaz?l?yor...");

    const mongoRoom = await Room.create({
      code: roomCode,
      host: username,
      users: [{
        username,
        avatar: '??',
        studied: 0,
        known: 0,
        unknown: 0
      }],
      isActive: true
    });

    console.log("Mongo room yaz?ld?:", mongoRoom.code);

    roomHosts.set(roomCode, username);

 const initialStats = {
      [username]: {
        studied: 0,
        known: 0,
        unknown: 0,
        avatar: '??'
      }
    };

    roomStats.set(roomCode, initialStats);

    socket.join(roomCode);

    roomUsers.set(socket.id, {
      roomCode,
      username,
      isHost: true,
      joinedAt: new Date()
    });

    const users = getUsersFromStats(roomCode);

    callback({
  success: true,
  roomCode,
  avatar: '??',
  isHost: true,
  users,
  stats: initialStats
});

io.to(roomCode).emit('sync-stats', {
  stats: initialStats,
  users
});

  } catch (error) {
    console.error('Error creating room:', error);
    callback?.({ success: false, error: error.message });
  }
});
  
  // ODAYA KATILMA
  socket.on('join-room', async ({ roomCode, username, avatar }, callback) => {
    
  try {
    console.log(`?? Join attempt: ${username} -> ${roomCode}`);

    if (!username || username.trim().length < 2) {
      if (callback) callback({ success: false, error: 'Ge?erli kullan?c? ad? girin' });
      return;
    }

    if (!roomCode || roomCode.length !== 6) {
      if (callback) callback({ success: false, error: 'Ge?erli oda kodu girin (6 haneli)' });
      return;
    }

    const room = await Room.findOne({ code: roomCode });

    if (!room || !room.isActive) {
      console.log(`? Room not found: ${roomCode}`);
      if (callback) callback({ success: false, error: 'Oda bulunamad? veya kapal?' });
      return;
    }

      
      // Ayn? kullan?c? ad? kontrol? (odada aktif olanlar aras?nda)
      const currentRoomStats = roomStats.get(roomCode) || {};
      if (currentRoomStats[username]) {
        console.log(`? Username taken: ${username}`);
        if (callback) callback({ success: false, error: 'Bu kullan?c? ad? odada kullan?l?yor' });
        return;
      }
      
      // Socket odaya kat?l
      socket.join(roomCode);
      
      // Host mu kontrol et (server taraf?nda g?venlik!)
      const isHost = roomHosts.get(roomCode) === username;
      
      // Kullan?c?y? kaydet
      roomUsers.set(socket.id, { 
        roomCode, 
        username, 
        isHost,
        joinedAt: new Date()
      });
      
      // Avatar ata
      const userAvatar = avatar || '??';
      
      // Stats'a ekle
      if (!roomStats.has(roomCode)) {
        roomStats.set(roomCode, {});
      }
      const stats = roomStats.get(roomCode);
      stats[username] = { 
        studied: 0, 
        known: 0, 
        unknown: 0,
        avatar: '??'
      };
      
      // Odadaki t?m kullan?c?lar? topla (g?ncel stats ile)
      const users = getUsersFromStats(roomCode);
      
      console.log(`? ${username} joined ${roomCode}. Total users: ${users.length}`);
      
      // CALLBACK ile yan?t ver
      if (callback) {
        callback({ 
          success: true,
          roomCode, 
          users,
          isHost,  // Server taraf?nda belirlenen de?er!
          stats: stats,
          avatar: '??'
        });
      }
      
      // Di?er kullan?c?lara bildir
      socket.to(roomCode).emit('user-joined', { 
        username, 
        socketId: socket.id,
        isHost,
        avatar: '??',
        studied: 0,
        known: 0
      });
      
      // T?m odadakilere g?ncel stats g?nder (users ile birlikte)
      io.to(roomCode).emit('sync-stats', { 
        stats,
        users: users
      });
      
    } catch (error) {
      console.error('? Error joining room:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // STATS G?NCELLEME
  socket.on('update-stats', ({ roomCode, username, studied, known, unknown }) => {
  try {
    const roomStat = roomStats.get(roomCode);

    if (roomStat && roomStat[username]) {

      roomStat[username].studied += studied || 0;
      roomStat[username].known += known || 0;
      roomStat[username].unknown += unknown || 0;

      const users = getUsersFromStats(roomCode);

      io.to(roomCode).emit('sync-stats', {
        stats: roomStat,
        users
      });
    }

  } catch (error) {
    console.error("Stats error:", error);
  }
});

  // KEL?ME DE???T?RME (sadece host)
  socket.on('change-word', ({ roomCode, wordIndex }) => {
    try {
      const user = roomUsers.get(socket.id);
      const hostName = roomHosts.get(roomCode);
      
      // G?venlik kontrol?: Sadece ger?ek host de?i?tirebilir
      if (user && user.roomCode === roomCode && user.username === hostName) {
        socket.to(roomCode).emit('sync-word', { wordIndex });
        console.log(`?? Word changed to ${wordIndex} by host ${user.username}`);
      } else {
        console.log(`?? Unauthorized word change attempt by ${user?.username}`);
      }
    } catch (error) {
      console.error('Error changing word:', error);
    }
  });

  // AYRILMA
  socket.on('leave-room', ({ roomCode, username }) => {
    handleUserLeave(socket, roomCode, username);
  });
  
  // BA?LANTI KOPMA
  socket.on('disconnect', (reason) => {
    console.log('? User disconnected:', socket.id, 'Reason:', reason);
    const user = roomUsers.get(socket.id);
    if (user) {
      handleUserLeave(socket, user.roomCode, user.username);
    }
  });
  
  // AYRILMA ??LEY?C?S?
    async function handleUserLeave(socket, roomCode, username) {
  try {
    if (!roomCode || !username) return;

    roomUsers.delete(socket.id);

    const stats = roomStats.get(roomCode);
    if (stats && stats[username]) {
      delete stats[username];

      const roomEmpty = !Array.from(roomUsers.values())
        .some(u => u.roomCode === roomCode);

      if (roomEmpty) {

        const room = await Room.findOne({ code: roomCode });        

        if (room) {
          room.isActive = false;
          await room.save();
        }
        
        // Clean up server memory
        roomStats.delete(roomCode);
        roomHosts.delete(roomCode);

        console.log(`??? Room ${roomCode} is now empty, cleaned up`);

      } else {

        const hostName = roomHosts.get(roomCode);

        if (hostName === username) {
          const remainingUsers = Array.from(roomUsers.values())
            .filter(u => u.roomCode === roomCode)
            .sort((a, b) => a.joinedAt - b.joinedAt);

          if (remainingUsers.length > 0) {
            const newHost = remainingUsers[0].username;

            roomHosts.set(roomCode, username);

const initialStats = {
  [username]: {
    studied: 0,
    known: 0,
    unknown: 0,
    avatar: '??'
  }
};
            console.log(`?? New host assigned: ${newHost}`);
          }
        }

        const users = getUsersFromStats(roomCode);

        io.to(roomCode).emit('user-left', { username, socketId: socket.id });
        io.to(roomCode).emit('sync-stats', {
          stats,
          users
        });
      }
    }

    socket.leave(roomCode);
    console.log(`?? ${username} left room ${roomCode}`);

  } catch (error) {
    console.error('Error leaving room:', error);
  }
}
});

// Static files (production i?in)
const clientPath = path.join(__dirname, 'ydt-kelime-pratigi', 'dist');
app.use(express.static(clientPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

// Hata yakalama
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  pushAdminError(err && err.message ? err.message : String(err), { type: 'uncaughtException' });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  pushAdminError(String(reason), { type: 'unhandledRejection' });
});
