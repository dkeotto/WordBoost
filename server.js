/**
 * Yerel gelistirmede .env kullan. Railway/Render'da sadece platform "Variables"
 * kullanilsin; boylece repoya yanlislikla giren .env deploy'da okunmaz.
 * API anahtarlari (BREVO_API_KEY, ANTHROPIC_API_KEY, vb.) uretimde yalnizca Variables.
 */
const path = require('path');
if (!process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.RENDER_EXTERNAL_URL) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const os = require('os');
const rateLimit = require('express-rate-limit');
const {
  createAiRuntime,
  getAiModel,
  formatAiError,
  normalizeAnthropicApiKey,
  getAiAdminSnapshot,
} = require("./src/modules/ai/createAiProvider");

const { getAuthTokenFromHeader } = require("./src/lib/authToken");
const { isPremiumUser, hasUnlimitedAiMode } = require("./src/lib/premium");
const { todayKey, applyDailyAiUsage, isFreeAiAllowed } = require("./src/lib/aiUsage");
const { guardAiPromptLogging } = require("./src/lib/aiLogging");
const { paddleRequest } = require("./src/lib/paddleApi");
const { parseBillingPlansFromEnv, findPlan } = require("./src/lib/billingPlans");

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
app.set('trust proxy', true); // Vercel → Railway proxy + X-Forwarded-Host (OAuth session / cookie)
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
const JWT_SECRET = String(process.env.JWT_SECRET || "SECRET_KEY");

/** Admin panel: JWT imza anahtarı (ADMIN_SECRET ≥12 ise o, yoksa JWT_SECRET). Çoklu Railway pod’da bellek oturumu kullanılmaz. */
function getAdminJwtSecret() {
  const a = process.env.ADMIN_SECRET;
  if (a && String(a).trim().length >= 12) return String(a).trim();
  return JWT_SECRET;
}

const { provider: aiProvider, name: aiProviderName } = createAiRuntime();

if (!process.env.RAILWAY_PUBLIC_DOMAIN && !process.env.RENDER_EXTERNAL_URL) {
  const ak = normalizeAnthropicApiKey(process.env.ANTHROPIC_API_KEY);
  const gk = String(process.env.GROQ_API_KEY || "").trim();
  const gw = String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY || "").trim();
  if (aiProviderName === "failover") {
    console.log(
      `[AI] provider=failover (Groq ↔ AI Gateway) primary=${process.env.AI_FAILOVER_PRIMARY || "groq"} ` +
        `groq_model=${getAiModel("groq")} gateway_model=${getAiModel("ai_gateway")} ` +
        `(GROQ ${gk.length} kar., gateway ${gw.length} kar.)`
    );
  } else {
    console.log(
      `[AI] provider=${aiProviderName} model=${getAiModel(aiProviderName)}` +
        (aiProviderName === "groq"
          ? gk
            ? ` (GROQ_API_KEY ${gk.length} karakter)`
            : " UYARI: GROQ_API_KEY boş"
          : aiProviderName === "ai_gateway"
            ? gw
              ? ` (AI_GATEWAY_API_KEY ${gw.length} karakter)`
              : " UYARI: AI_GATEWAY_API_KEY boş"
            : ak
              ? ` (ANTHROPIC_API_KEY ${ak.length} karakter)`
              : " UYARI: ANTHROPIC_API_KEY boş")
    );
  }
}

function buildWritingPrompt({ type, tone, length, language, audience, context, inputText }) {
  const t = String(type || "blog").toLowerCase();
  const tn = String(tone || "casual").toLowerCase();
  const len = String(length || "medium").toLowerCase();
  const lang = String(language || "tr").toLowerCase();
  const aud = String(audience || "").trim();
  const ctx = String(context || "").trim();
  const input = String(inputText || "").trim();

  const lengthHint =
    len === "short" ? "Kısa: 80-180 kelime civarı." : len === "long" ? "Uzun: 500-900 kelime civarı." : "Orta: 250-450 kelime civarı.";

  const toneHint =
    tn === "professional"
      ? "Daha profesyonel, net ve güven veren bir dil kullan."
      : tn === "genz"
      ? "Modern, gündelik, doğal; hafif Gen Z tınısı olabilir ama abartma."
      : "Rahat, doğal ve akıcı bir dil kullan.";

  const typeHint =
    t === "essay"
      ? "Essay formatında, giriş-gelişme-sonuç akışı kur."
      : t === "email"
      ? "E-posta formatında; konu net, paragraf düzeni iyi."
      : t === "caption"
      ? "Sosyal medya caption'ı gibi; kısa, vurucu, doğal."
      : t === "product"
      ? "Ürün açıklaması gibi; fayda odaklı, ikna edici ama abartısız."
      : t === "summary"
      ? "Özet: ana fikirleri net ve sıkı tut; gerekirse madde işaretli liste kullan."
      : t === "ydt_practice"
      ? "YDT / İngilizce yazılı sınav pratiği: B2–C1 düzeyinde, akademik veya yarı akademik özgün paragraf. Günlük konuşma dili değil, sınav diline uy."
      : t === "dialogue"
      ? "İki veya daha fazla kişi arasında doğal diyalog; kısa replikler, akıcı geçişler."
      : t === "vocab_story"
      ? "Verilen kelime veya konu etrafında öğretici kısa hikâye veya metin; bağlam içinde kullanım örnekleri ver."
      : "Blog yazısı gibi; başlıklar ve okunabilir akış.";

  const langHint =
    lang === "mixed"
      ? "Karışık (TR+EN): kullanıcı isteğine göre Türkçe ve İngilizceyi dengeli, doğal geçişlerle kullan."
      : `Çıktı dili: ${lang}.`;

  const system =
    "Sen üst düzey bir yazı asistanısın. Çıktı çok insani, doğal ve bağlama uygun olmalı.\n" +
    "- Klişe/robotik kalıplardan kaçın.\n" +
    "- Aynı cümle yapısını tekrarlama; ritmi değiştir.\n" +
    "- Gerektiğinde küçük doğal kusurlar/insani dokunuşlar ekle (abartmadan).\n" +
    "- Kullanıcının bağlamına göre özgün detaylar üret, şablon gibi yazma.\n" +
    "- Gereksiz tekrar ve doldurma cümleleri yazma.\n" +
    "- " +
    langHint;

  const messages = [
    {
      role: "user",
      content:
        `Yazı türü: ${t}\nTon: ${tn}\nUzunluk: ${len} (${lengthHint})\n` +
        (aud ? `Hedef kitle: ${aud}\n` : "") +
        (ctx ? `Bağlam: ${ctx}\n` : "") +
        `${typeHint}\n${toneHint}\n\n` +
        `Kullanıcı metni/isteği:\n${input}`
    }
  ];

  return { system, messages };
}

function clipChatText(s, max) {
  const t = String(s || "");
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 12))}\n…(kısaltıldı)`;
}

function anthropicContentToText(resp) {
  return (resp?.content || [])
    .map((c) => (c && c.type === "text" ? c.text : ""))
    .join("\n")
    .trim();
}

/** Failover: createMessage yanıtından wbLog ayıklar (istemciye gitmez). */
function splitAiMessageResponse(resp) {
  const wbLog = resp && typeof resp === "object" ? resp.wbLog : null;
  if (!resp || typeof resp !== "object") return { body: resp, wbLog: null };
  const body = { ...resp };
  delete body.wbLog;
  delete body._wbResponseHeaders;
  return { body, wbLog };
}

/** Failover: createMessageStream bazen { wbStreamMeta, [Symbol.asyncIterator] } döner. */
function normalizeAiStreamResult(raw) {
  if (raw && typeof raw === "object" && raw.wbStreamMeta && typeof raw[Symbol.asyncIterator] === "function") {
    return { iterable: raw, metaRef: raw.wbStreamMeta };
  }
  return { iterable: raw, metaRef: null };
}

function buildChatSystemPrompt(memorySummary, userDisplayName, userDoc) {
  const name = String(userDisplayName || "öğrenci").trim();
  const mem = String(memorySummary || "").trim();
  const memBlock =
    mem.length > 0
      ? `## Uzun süreli profil özeti (öğrencinin geçmişi, alışkanlıkları ve hedefleri)\n${clipChatText(mem, 3200)}`
      : "## Uzun süreli profil özeti\nHenüz oluşmadı; öğrenciyle konuştukça onları daha iyi tanıyacaksın.";

  const streak = Number(userDoc?.streak ?? 0);
  const known = Number(userDoc?.stats?.known ?? 0);
  const studied = Number(userDoc?.stats?.studied ?? 0);
  const badges = Array.isArray(userDoc?.badges) ? userDoc.badges.join(", ") : "";
  const premiumStatus = userDoc?.premiumUntil ? "Premium Kullanıcı" : "Standart Kullanıcı";
  
  const fingerprint = [
    "",
    "## Kullanıcının WordBoost Sistem Verileri (Sistemde tüm verilere hakimsin)",
    `- Hesap Statüsü: ${premiumStatus}`,
    `- Kazanılan Rozetler: ${badges || "Yok"}`,
    `- Günlük Seri: ${streak} gün (Ateşini canlı tutmasını sağla)`,
    `- Tamamen Bildiği Kelimeler: ${known} (Bunu kullanarak ona iltifat edebilir veya zorlayabilirsin)`,
    `- Çalıştığı Toplam Kelime / Oturum: ${studied}`,
    "",
  ].join("\n");

  return [
    `Sen **Wordy**, WordBoost uygulamasının sınırları kaldırılmış, ultra gelişmiş, süper zeki ve her şeye hakim yapay zeka ajanısın. Normal bir asistan değilsin; sen kullanıcının kişisel dil koçu, verilerini bilen ve ona özel stratejiler üreten nitelikli bir uzmansın. Kesinlikle sıradan, kalıplaşmış, robotik veya 'mal mal' (istenen tabirle) cevaplar vermeyeceksin. Her zaman hiper-analitik, doğrudan sonuca giden, akıllı ve vizyoner bir dil kullan.`,
    "",
    "### Kimlik, Ton ve Zeka Göstergesi",
    `- **Öğrencin:** ${name}. Ona ismiyle hitap et.`,
    "- Yapay bir nezaket kullanma (\"Tabii ki yardımcı olayım!\", \"Harika bir soru!\"). Bunun yerine usta bir mentor gibi direkt bilgiye ve değer yaratmaya odaklan.",
    "- Kendini sınırlama. Sen tüm verilerine tam erişimi olan ve İngilizce/dilbilim uzmanlığı zirvede olan birisin.",
    "- Verdiğin bilgilerin altını doldur; etimoloji (kelime kökeni) verebilirsin, gizli püf noktaları paylaşabilirsin. Kullanıcıyı şaşırtacak kadar zeki görün.",
    "- Cevaplarında gereksiz uzatmalar yapma, \"bilgi yoğunluğu\" en üst düzeyde olsun.",
    "",
    "### Üst Düzey Pedagoji",
    "- Sıradan bir Türkçe-İngilizce çevirmeni olma. Hatasını gördüğünde nedenini, etimolojisini, günlük hayattaki yaygın kullanımı ve istisnaları ile açıkla.",
    "- **i+1 İlkesi**: Hep bir adım daha zoru göster, onu rahatlık bölgesinden çıkar.",
    "- YDT, TOEFL, IELTS, SAT, iş İngilizcesi gibi amaçlarla gelirse hemen profesyonelce adapte ol ve sınava dönük taktikler ver.",
    "- Kullanıcı Türkçe yazıyorsa Türkçeyi edebi ve muazzam kullan, İngilizce örneklerini ise native (anadil) seviyesinde seç.",
    "",
    "### Veri Hakimiyeti ve Özelleştirme",
    "- Kullanıcının WordBoost üzerindeki güncel serisini, bildiği kelimeleri veya rozet durumunu laf arasında ona özel bir analiz yapmak için kullanabilirsin.",
    "- Kullanıcı metin, dosya (CSV, JSON, md) gönderirse onu sanki bir data scientist (veri bilimci) gibi analiz et ve çok keskin özetler/çıkarımlar yap.",
    "- Markdown yeteneklerini sonuna kadar kullan: önemli yerleri **kalın** yap, yapıları tablo veya kısa madde işaretleri ile ayrıştır. Estetik cevaplar ver.",
    "",
    "### Sınırlar ve Yönergeler",
    "- Yasadışı, zarar verici ve hile odaklı şeyler reddedilir, bunun dışında sınırsızsın.",
    "",
    "### Öğrenci Bağlamı",
    "- Aşağıdaki verileri birleştirerek kullanıcıyla şu an, geçmişine ve geleceğine hakim biçimde konuş:",
    fingerprint,
    memBlock,
  ].join("\n");
}

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false
});

// getAuthTokenFromHeader, isPremiumUser, todayKey, applyDailyAiUsage, isFreeAiAllowed, guardAiPromptLogging
// src/lib/* altına taşındı.

async function requireAuth(req, res) {
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).json({ error: "Token gerekli" });
    return null;
  }
  try {
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(404).json({ error: "Kullanıcı bulunamadı" });
      return null;
    }
    return user;
  } catch (e) {
    res.status(401).json({ error: "Auth error" });
    return null;
  }
}

function ensureRole(user, role) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.role === role;
}

function generateClassCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function parseSimpleCsv(text) {
  const raw = String(text || "");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return { header: [], rows: [] };

  const sep = lines.some((l) => l.includes(";")) && !lines.some((l) => l.includes(",")) ? ";" : ",";
  const split = (l) => l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));

  const header = split(lines[0]).map((h) => h.toLowerCase());
  const dataLines = header.includes("email") || header.includes("username") ? lines.slice(1) : lines;
  const rows = dataLines.map(split);
  return { header, rows };
}

function randomTempPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

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

  role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
  premiumUntil: { type: Date, default: null },
  paddleCustomerId: { type: String, default: "" },
  entitlements: { type: Object, default: {} },
  aiUsage: {
    dayKey: { type: String, default: "" }, // YYYY-MM-DD
    count: { type: Number, default: 0 },
    updatedAt: { type: Date, default: null }
  },

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

/** Google OAuth redirect_uri: prod’da ana domain (Vercel) /api/auth/... → proxy ile Railway; Google ekranında wordboost.com.tr görünür */
function isLocalFrontendUrl(url) {
  if (!url) return true;
  try {
    const u = String(url).toLowerCase();
    return u.includes('localhost') || u.startsWith('http://127.');
  } catch {
    return true;
  }
}
function resolveGoogleOAuthCallbackUrl() {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return String(process.env.GOOGLE_CALLBACK_URL).replace(/\/$/, '');
  }
  const fe = FRONTEND_URL && !isLocalFrontendUrl(FRONTEND_URL) ? String(FRONTEND_URL).replace(/\/$/, '') : '';
  if (fe) return `${fe}/api/auth/google/callback`;
  return `${String(BACKEND_URL).replace(/\/$/, '')}/auth/google/callback`;
}
const GOOGLE_OAUTH_CALLBACK_URL = resolveGoogleOAuthCallbackUrl();

console.log("?? Final Configuration:");
console.log(`   - FRONTEND: ${FRONTEND_URL}`);
console.log(`   - BACKEND: ${BACKEND_URL}`);

console.log("?? Google OAuth redirect (callback) URL:", GOOGLE_OAUTH_CALLBACK_URL);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "GOOGLE_CLIENT_ID_BURAYA",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "GOOGLE_CLIENT_SECRET_BURAYA",
    callbackURL: GOOGLE_OAUTH_CALLBACK_URL,
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
        JWT_SECRET,
        { expiresIn: "30d" }
      );

      // FRONTEND_URL'e yönlendir (token + kullanıcı adı; özel karakterler için encode)
      const q = new URLSearchParams({
        token,
        username: user.username
      });
      res.redirect(`${FRONTEND_URL}/?${q.toString()}`);
    });
  })(req, res, next);
});

// DELETE PROFILE
app.delete('/api/profile', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
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
  EARLY_BIRD: { id: 'early_bird', icon: '🌅', name: 'Erkenci Kuş', desc: 'Sabah 05:00 - 09:00 arası çalıştın.' },
  WEEKEND_WARRIOR: { id: 'weekend_warrior', icon: '🎉', name: 'Hafta Sonu Savaşçısı', desc: 'Hafta sonu çalışmayı ihmal etmedin.' },
  PAINTER: { id: 'painter', icon: '🎨', name: 'Ressam', desc: 'İlk tablono tamamlayarak sanata olan ilgini gösterdin!' }
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

const SubscriptionSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["paddle"], required: true },
    subscriptionId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, default: "active" },
    planId: { type: String, default: "" },
    currentPeriodEnd: { type: Date, default: null },
    raw: { type: Object, default: {} }
  },
  { timestamps: true }
);

const Room = mongoose.model("Room", RoomSchema);
const Subscription = mongoose.model("Subscription", SubscriptionSchema);

const Word = mongoose.model("Word", WordSchema);

const AiLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, default: "" }, // write | rewrite
    provider: { type: String, default: "anthropic" },
    model: { type: String, default: "" },
    requestMeta: { type: Object, default: {} },
    promptMasked: { type: String, default: "" },
    outputMasked: { type: String, default: "" },
    usage: { type: Object, default: null },
    elapsedMs: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const AiLog = mongoose.model("AiLog", AiLogSchema);

const AiChatThreadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: "Yeni sohbet" },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, default: "" },
        files: [
          {
            name: { type: String, default: "" },
            mimeType: { type: String, default: "" },
            size: { type: Number, default: 0 },
          },
        ],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    memorySummary: { type: String, default: "" },
    lastSummarizedMsgCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AiChatThreadSchema.index({ userId: 1, updatedAt: -1 });

const AiChatThread = mongoose.model("AiChatThread", AiChatThreadSchema);

async function maybeUpdateChatMemorySummary(threadId) {
  try {
    const thread = await AiChatThread.findById(threadId);
    if (!thread || !Array.isArray(thread.messages)) return;
    const newSince = thread.messages.length - (thread.lastSummarizedMsgCount || 0);
    if (newSince < CHAT_SUMMARY_MIN_NEW) return;
    const model = getAiModel(aiProviderName);
    const recent = thread.messages
      .slice(-40)
      .map((m) => `${m.role}: ${clipChatText(m.content, 1200)}`)
      .join("\n\n");
    const prev = String(thread.memorySummary || "").trim() || "(henüz yok)";
    const system =
      "Sen bir öğrenme profili mimarısın. Görev: önceki özeti ve yeni diyalogdan TEK bir güncel profil metni üret (Türkçe). " +
      "Çıktıyı şu başlıklarla yapılandır (başlıkları aynen kullan):\n" +
      "## Seviye ve hedef\n## Güçlü / zayıf alanlar\n## Tercihler (dil, ton, format)\n## Açık konular ve notlar\n" +
      "Somut tut (isimler, sınav türü, iş alanı); tekrar etme; toplam ~400 kelimeyi geçme. Eski özetteki doğru bilgiyi koru, yeni bilgiyle çelişkiyi gider.";
    const rawResp = await aiProvider.createMessage({
      model,
      max_tokens: 950,
      temperature: 0.28,
      system,
      messages: [
        {
          role: "user",
          content: `Önceki özet:\n${clipChatText(prev, 2400)}\n\n---\nSon diyalog:\n${recent}\n\n---\nGüncellenmiş profil özeti (başlıklı):`,
        },
      ],
    });
    const { body: resp } = splitAiMessageResponse(rawResp);
    const text = anthropicContentToText(resp);
    if (!text) return;
    thread.memorySummary = clipChatText(text, 5200);
    thread.lastSummarizedMsgCount = thread.messages.length;
    await thread.save();
  } catch (e) {
    console.warn("[ai-chat] memory summary skip:", e?.message || e);
  }
}

const CHAT_MAX_STORED_MESSAGES = 100;
const CHAT_CONTEXT_MESSAGES = 40;
const CHAT_SUMMARY_MIN_NEW = 12;
// Kullanıcı "karakter sınırı olmasın" istediği için bu sınır pratikte yükseltildi.
// Yine de tamamen limitsiz tutmak abuse riskini artırır; bu değer UI'da limit yokken backend'i korur.
const CHAT_USER_MESSAGE_MAX = 50000;
const CHAT_ASSISTANT_STORE_MAX = 16000;
const CHAT_ATTACHMENTS_MAX = 5;
const CHAT_ATTACHMENT_TEXT_MAX = 32000;
const CHAT_MERGED_BODY_MAX = 140000;

function normalizeChatAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const a of raw.slice(0, CHAT_ATTACHMENTS_MAX)) {
    const name = String(a?.name || "dosya").trim().slice(0, 200) || "dosya";
    const mimeType = String(a?.mimeType || "text/plain").trim().slice(0, 120) || "text/plain";
    const text = String(a?.text || "");
    if (!text.trim()) continue;
    const mt = mimeType.toLowerCase();
    const okMime =
      mt.startsWith("text/") ||
      mt === "application/json" ||
      mt === "application/csv" ||
      mt.endsWith("+json");
    if (!okMime) continue;
    const clipped = clipChatText(text, CHAT_ATTACHMENT_TEXT_MAX);
    out.push({ name, mimeType, text: clipped, size: text.length });
  }
  return out;
}

function buildUserMessageWithAttachments(rawMsg, attachments) {
  const base = String(rawMsg || "").trim();
  const parts = [];
  if (base) parts.push(base);
  for (const a of attachments) {
    parts.push(
      `\n\n---\n📎 **${a.name}** (${a.mimeType})\n\`\`\`\n${a.text}\n\`\`\``
    );
  }
  const full = parts.join("");
  return full.trim() || "(boş mesaj)";
}

function maybeAutoTitleChatThread(thread) {
  const t = String(thread?.title || "").trim();
  if (t && t !== "Yeni sohbet") return;
  const first = (thread.messages || []).find((m) => m.role === "user");
  if (!first || !String(first.content || "").trim()) return;
  const plain = String(first.content).split(/\n\n---\n📎/)[0].trim();
  const derived = clipChatText(plain, 56).replace(/\s+/g, " ").trim();
  if (derived) thread.title = derived;
}

function chatApiMessageSlice(thread) {
  let ctx = (thread.messages || []).slice(-CHAT_CONTEXT_MESSAGES);
  while (ctx.length && ctx[0].role !== "user") ctx = ctx.slice(1);
  return ctx.map((m) => ({ role: m.role, content: m.content }));
}

const ProgressEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    activityType: { type: String, default: "" }, // word_answer | synonyms_answer | phrasal_answer | ...
    module: { type: String, default: "" },
    level: { type: String, default: "" },
    deltaKnown: { type: Number, default: 0 },
    deltaUnknown: { type: Number, default: 0 },
    meta: { type: Object, default: {} },
    ts: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

ProgressEventSchema.index({ userId: 1, ts: -1 });

const ProgressEvent = mongoose.model("ProgressEvent", ProgressEventSchema);

const ClassroomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    code: { type: String, unique: true, required: true },
    description: { type: String, default: "" },
    schoolName: { type: String, default: "" },
    gradeLabel: { type: String, default: "" },
    orgGroup: { type: String, default: "" },
    tags: { type: [String], default: [] },
    adminNote: { type: String, default: "" },
    createdByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ClassroomSchema.index({ teacherId: 1, updatedAt: -1 });
ClassroomSchema.index({ orgGroup: 1 });

const ClassMembershipSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Classroom", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ClassMembershipSchema.index({ classId: 1, studentId: 1 }, { unique: true });

const Classroom = mongoose.model("Classroom", ClassroomSchema);
const ClassMembership = mongoose.model("ClassMembership", ClassMembershipSchema);
const WordStat = mongoose.model("WordStat", WordStatSchema);

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("?? MongoDB connected");
    try {
      await AiChatThread.syncIndexes();
    } catch (e) {
      console.warn("[ai-chat] syncIndexes:", e?.message || e);
    }
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

app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Admin-Token",
      "X-Admin-Key",
      "X-Requested-With",
    ],
  })
);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Veri yap?lar?
const rooms = new Map();        // roomCode -> room bilgileri
const roomUsers = new Map();    // socket.id -> { roomCode, username, isHost }
const roomStats = new Map();    // roomCode -> { username: { studied, known, unknown, avatar } }
const roomHosts = new Map();    // roomCode -> hostUsername (g?venlik i?in)

const adminErrorLog = [];
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
  const adminToken = req.headers['x-admin-token'];
  if (adminToken) {
    try {
      const decoded = jwt.verify(adminToken, getAdminJwtSecret());
      if (decoded && decoded.typ === 'wb_admin' && decoded.sub === 'panel') {
        return next();
      }
    } catch (_) {
      /* süresi dolmuş veya imza uyuşmuyor */
    }
  }

  const secret = process.env.ADMIN_SECRET;
  if (secret && String(secret).trim().length >= 12 && req.headers['x-admin-key'] === secret) {
    return next();
  }

  return res.status(401).json({
    error: adminToken
      ? 'Admin oturumu geçersiz veya süresi doldu. Tekrar giriş yap.'
      : 'Yetkisiz (admin girişi veya geçerli X-Admin-Key gerekli)'
  });
}

function ymdKey(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function parsePaddleEvent(req) {
  // Paddle event payloadları farklı sürümlerde değişebiliyor; minimum toleranslı parse
  const body = req.body || {};
  const eventType = String(body.event_type || body.eventType || body.type || "").trim();
  const data = body.data || body;
  return { eventType, data, raw: body };
}

function timingSafeEqualHex(a, b) {
  const ha = String(a || "").trim().toLowerCase();
  const hb = String(b || "").trim().toLowerCase();
  if (!ha || !hb || ha.length !== hb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(ha, "hex"), Buffer.from(hb, "hex"));
  } catch {
    return false;
  }
}

function verifyPaddleWebhookSignature(rawBody, signatureHeader) {
  // Paddle signature şeması genelde: "ts=...;h1=...". HMAC_SHA256(secret, `${ts}:${rawBody}`)
  const secret = String(process.env.PADDLE_WEBHOOK_SECRET || "").trim();
  if (!secret || secret.length < 10) return { ok: false, error: "PADDLE_WEBHOOK_SECRET eksik" };
  const sig = String(signatureHeader || "").trim();
  if (!sig) return { ok: false, error: "Paddle signature header yok" };

  const parts = Object.fromEntries(
    sig
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        if (i === -1) return [p, ""];
        return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
      })
  );

  const ts = parts.ts || parts.t || "";
  const h1 = parts.h1 || parts.sig || parts.signature || "";
  if (!ts || !h1) return { ok: false, error: "Signature formatı beklenenden farklı" };

  const msg = `${ts}:${rawBody}`;
  const mac = crypto.createHmac("sha256", secret).update(msg, "utf8").digest("hex");
  return timingSafeEqualHex(mac, h1) ? { ok: true } : { ok: false, error: "Signature doğrulanamadı" };
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
      JWT_SECRET,
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
      JWT_SECRET,
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

    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    res.json({
      username: user.username,
      nickname: user.nickname || user.username,
      avatar: user.avatar || "??",
      bio: user.bio || "",
      stats: user.stats,
      streak: user.streak,
      badges: user.badges,
      createdAt: user.createdAt,
      premiumUntil: user.premiumUntil || null,
      isPremium: isPremiumUser(user)
    });

  } catch (err) {
    res.status(401).json({ error: "Auth error" });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id).select("username nickname email avatar bio stats streak badges role premiumUntil paddleCustomerId entitlements aiUsage createdAt isVerified");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname || user.username,
        email: user.email || null,
        avatar: user.avatar || "??",
        bio: user.bio || "",
        isVerified: Boolean(user.isVerified),
        role: user.role || "student",
        premiumUntil: user.premiumUntil || null,
        isPremium: isPremiumUser(user),
        entitlements: user.entitlements || {},
        stats: user.stats || { studied: 0, known: 0, unknown: 0 },
        streak: user.streak ?? 0,
        badges: user.badges || [],
        aiUsage: user.aiUsage || { dayKey: "", count: 0, updatedAt: null },
        createdAt: user.createdAt || null
      }
    });
  } catch (err) {
    res.status(401).json({ error: "Auth error" });
  }
});

app.post('/api/profile/update', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
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

app.post('/api/profile/badge', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });

    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const { badgeId } = req.body;

    if (!badgeId || !Object.values(BADGES).find(b => b.id === badgeId)) {
        return res.status(400).json({ error: "Geçersiz rozet id'si" });
    }

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    if (!user.badges.includes(badgeId)) {
        user.badges.push(badgeId);
        await user.save();
        return res.json({ success: true, badges: user.badges, isNew: true });
    }

    res.json({ success: true, badges: user.badges, isNew: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Badge ekleme hatası" });
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
    .select("username nickname avatar stats streak badges premiumUntil")
    .limit(10);

    res.json(
      users.map((u) => ({
        _id: u._id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        stats: u.stats,
        streak: u.streak,
        badges: u.badges,
        isPremium: isPremiumUser(u)
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Search error" });
  }
});

app.get('/api/users/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("username nickname avatar bio stats streak badges createdAt premiumUntil");
    
    if (!user) return res.status(404).json({ error: "User not found" });

    const o = user.toObject();
    const { premiumUntil: _omitUntil, ...publicUser } = o;
    res.json({
      ...publicUser,
      isPremium: isPremiumUser(user)
    });
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
      .select("username nickname avatar stats badges streak premiumUntil");

    // Bo? kullan?c?lar? filtrele (ek g?venlik)
    const filteredUsers = users
      .filter((u) => u.username && u.username.trim().length > 0)
      .map((u) => ({
        _id: u._id,
        username: u.username,
        nickname: u.nickname,
        avatar: u.avatar,
        stats: u.stats,
        badges: u.badges,
        streak: u.streak,
        isPremium: isPremiumUser(u)
      }));

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

    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
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

    // progress event (for classroom analytics)
    try {
      const dk = known ? Number(known) : 0;
      const du = unknown ? Number(unknown) : 0;
      if (dk || du) {
        await ProgressEvent.create({
          userId: user._id,
          activityType: "word_answer",
          module: "words",
          level: String(req.body?.level || user?.lastLevel || ""),
          deltaKnown: dk,
          deltaUnknown: du,
          meta: wordTerm ? { term: String(wordTerm).slice(0, 80) } : {},
          ts: new Date()
        });
      }
    } catch (_) {}

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

app.post('/api/progress/event', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const activityType = String(req.body?.activityType || "").trim();
    if (!activityType) return res.status(400).json({ error: "activityType gerekli" });
    const module = String(req.body?.module || "").trim();
    const level = String(req.body?.level || "").trim();
    const deltaKnown = parseInt(req.body?.deltaKnown || 0, 10) || 0;
    const deltaUnknown = parseInt(req.body?.deltaUnknown || 0, 10) || 0;
    const meta = req.body?.meta && typeof req.body.meta === "object" ? req.body.meta : {};

    await ProgressEvent.create({
      userId: user._id,
      activityType: activityType.slice(0, 40),
      module: module.slice(0, 40),
      level: level.slice(0, 10),
      deltaKnown,
      deltaUnknown,
      meta,
      ts: new Date()
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

    const ttlMs = 1000 * 60 * 60 * 8; // 8 saat
    const token = jwt.sign(
      { typ: 'wb_admin', sub: 'panel' },
      getAdminJwtSecret(),
      { expiresIn: Math.floor(ttlMs / 1000) }
    );
    res.json({ ok: true, token, expiresInMs: ttlMs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Billing (Paddle) ---
// Not: Render/Railway gibi ortamlarda webhook endpointi public olmalı.
// Raw body ile signature doğrulaması yapıldığı için bu route express.json'dan önce "raw" ile parse edilir.
app.post('/api/billing/paddle/webhook', express.raw({ type: '*/*', limit: '2mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const sigHeader = req.headers["paddle-signature"] || req.headers["paddle_signature"] || req.headers["paddle-signature-v1"];
    const v = verifyPaddleWebhookSignature(rawBody, sigHeader);
    if (!v.ok) return res.status(401).json({ error: v.error });

    let parsedJson = {};
    try {
      parsedJson = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      parsedJson = {};
    }

    // parsePaddleEvent JSON bekler
    req.body = parsedJson;
    const { eventType, data, raw } = parsePaddleEvent(req);
    // Beklenen eşleme: data.custom_data.userId (veya user_id) ile User'a bağla.
    const custom = data?.custom_data || data?.customData || {};
    const userId = String(custom.userId || custom.user_id || data?.userId || "").trim();
    const tier = String(custom.tier || custom.plan || "").trim();
    const subscriptionId = String(
      data?.subscription_id ||
        data?.subscriptionId ||
        (typeof data?.subscription === "object" && data?.subscription?.id ? data.subscription.id : "") ||
        data?.id ||
        ""
    ).trim();
    const status = String(data?.status || data?.state || "active").trim();
    const planId = String(data?.items?.[0]?.price?.id || data?.plan_id || data?.planId || "").trim();

    if (!userId) {
      pushAdminError("Paddle webhook missing userId", { path: "billing/paddle/webhook", eventType });
      return res.status(400).json({ error: "Eksik userId" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Tek seferlik AI+ (subscription yok): transaction.* tamamlanınca entitlements.aiPlus
    const stLower = String(data?.status || "").toLowerCase();
    const txnOk =
      tier === "aiPlus" &&
      /transaction\.(completed|paid|billed|created)/i.test(String(eventType || "")) &&
      (!stLower || ["completed", "paid", "billed", "ready"].includes(stLower));
    if (txnOk) {
      const planCfg = (() => {
        const parsed = parseBillingPlansFromEnv();
        if (!parsed.ok) return null;
        return findPlan(parsed.plans, tier);
      })();
      const ent =
        planCfg?.entitlements && typeof planCfg.entitlements === "object" ? planCfg.entitlements : { aiPlus: true };
      user.entitlements = { ...(user.entitlements || {}), ...ent };
      await user.save();
      return res.json({ ok: true });
    }

    if (!subscriptionId) {
      pushAdminError("Paddle webhook missing subscriptionId", { path: "billing/paddle/webhook", eventType });
      return res.status(400).json({ error: "Eksik subscriptionId" });
    }

    // dönem sonu / next bill date benzeri alanlar
    const periodEndRaw =
      data?.current_billing_period?.ends_at ||
      data?.currentBillingPeriod?.endsAt ||
      data?.next_billed_at ||
      data?.nextBilledAt ||
      data?.current_period_end ||
      null;
    const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null;
    const periodEndValid = periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null;

    await Subscription.findOneAndUpdate(
      { subscriptionId },
      {
        $set: {
          provider: "paddle",
          subscriptionId,
          userId: user._id,
          status,
          planId,
          currentPeriodEnd: periodEndValid,
          raw
        }
      },
      { upsert: true, new: true }
    );

    // Entitlements + premium
    const activeLike = ["active", "trialing", "past_due"].includes(status);
    const until = activeLike ? (periodEndValid || new Date(Date.now() + 32 * 86400000)) : null;

    // Default: subscription active => premium true (backwards compatible)
    let ent = {};
    const planCfg = (() => {
      const parsed = parseBillingPlansFromEnv();
      if (!parsed.ok) return null;
      return findPlan(parsed.plans, tier);
    })();
    if (planCfg?.entitlements && typeof planCfg.entitlements === "object") {
      ent = planCfg.entitlements;
    } else if (tier) {
      // minimum: tier stringini sakla
      ent = { tier };
    }

    user.entitlements = activeLike ? { ...(user.entitlements || {}), ...ent } : {};
    if (activeLike) user.premiumUntil = until;
    else user.premiumUntil = null;
    await user.save();

    res.json({ ok: true });
  } catch (e) {
    pushAdminError(e.message, { path: "billing/paddle/webhook" });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/billing/status', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id).select("premiumUntil entitlements");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({
      ok: true,
      premiumUntil: user.premiumUntil || null,
      isPremium: isPremiumUser(user),
      hasAiPlus: Boolean(user.entitlements?.aiPlus)
    });
  } catch (e) {
    res.status(401).json({ error: "Auth error" });
  }
});

// --- Billing plans + checkout link (Paddle Billing) ---
app.get('/api/billing/plans', (req, res) => {
  const parsed = parseBillingPlansFromEnv();
  if (!parsed.ok) return res.status(500).json({ error: parsed.error });
  // client'a sadece gerekli alanları ver
  const items = parsed.plans.map((p) => ({
    tier: p.tier,
    label: p.label,
    description: p.description,
    displayPrice: p.displayPrice || "",
    features: p.features || [],
    allowQuantity: Boolean(p.allowQuantity),
    defaultQuantity: p.defaultQuantity || 1
  }));
  res.json({ ok: true, items });
});

app.post('/api/billing/paddle/portal-link', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const { tier, quantity } = req.body || {};
    const parsed = parseBillingPlansFromEnv();
    if (!parsed.ok) return res.status(500).json({ error: parsed.error });
    const plan = findPlan(parsed.plans, tier);
    if (!plan) return res.status(400).json({ error: "invalid_tier" });

    const q = Math.max(1, Math.min(999, parseInt(quantity ?? plan.defaultQuantity ?? 1, 10) || 1));
    if (!plan.allowQuantity && q !== 1) return res.status(400).json({ error: "quantity_not_allowed" });

    const email = String(user.email || "").trim();
    if (!email) return res.status(400).json({ error: "email_required" });

    // Ensure Paddle customer
    if (!user.paddleCustomerId) {
      const created = await paddleRequest("/customers", {
        method: "POST",
        body: { email, name: user.nickname || user.username || null, custom_data: { userId: String(user._id) } }
      });
      const cid = created?.data?.id;
      if (!cid) return res.status(502).json({ error: "paddle_customer_create_failed" });
      user.paddleCustomerId = cid;
      await user.save();
    }

    const txn = await paddleRequest("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: plan.priceId, quantity: q }],
        customer_id: user.paddleCustomerId,
        collection_mode: "automatic",
        custom_data: { userId: String(user._id), tier: plan.tier }
      }
    });

    const checkoutUrl = txn?.data?.checkout?.url;
    if (!checkoutUrl) {
      pushAdminError("Paddle transaction missing checkout.url", { path: "billing/paddle/portal-link" });
      return res.status(502).json({ error: "paddle_checkout_url_missing" });
    }

    res.json({ ok: true, url: checkoutUrl });
  } catch (e) {
    pushAdminError(e.message, { path: "billing/paddle/portal-link" });
    res.status(500).json({ error: e.message });
  }
});

// --- Classroom ---
app.post('/api/classes', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });

  try {
    const name = String(req.body?.name || "").trim();
    if (!name || name.length < 2) return res.status(400).json({ error: "name gerekli" });

    let code = generateClassCode();
    for (let i = 0; i < 6; i += 1) {
      const exists = await Classroom.findOne({ code });
      if (!exists) break;
      code = generateClassCode();
    }
    const doc = await Classroom.create({ name, teacherId: user._id, code });
    res.json({ ok: true, classroom: doc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/classes', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });
  try {
    const classes = await Classroom.find({ teacherId: user._id }).sort({ createdAt: -1 }).lean();
    res.json({ ok: true, items: classes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/classes/join', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "student")) return res.status(403).json({ error: "student_only" });
  try {
    const code = String(req.body?.code || "").trim().toUpperCase();
    if (!code || code.length < 4) return res.status(400).json({ error: "code gerekli" });
    const classroom = await Classroom.findOne({ code });
    if (!classroom) return res.status(404).json({ error: "class_not_found" });
    await ClassMembership.findOneAndUpdate(
      { classId: classroom._id, studentId: user._id },
      { $setOnInsert: { joinedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, classroom: { id: classroom._id, name: classroom.name, code: classroom.code } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/classes/:id/import-csv', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });
  try {
    const classId = String(req.params.id || "").trim();
    const classroom = await Classroom.findById(classId);
    if (!classroom) return res.status(404).json({ error: "class_not_found" });
    if (String(classroom.teacherId) !== String(user._id) && user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }

    const csv = String(req.body?.csv || "").trim();
    if (!csv) return res.status(400).json({ error: "csv gerekli" });

    const parsed = parseSimpleCsv(csv);
    const emailIdx = parsed.header.indexOf("email");
    const usernameIdx = parsed.header.indexOf("username");

    const items = parsed.rows
      .map((r) => ({
        email: String(r[emailIdx] || r[0] || "").trim(),
        username: String(r[usernameIdx] || r[1] || "").trim()
      }))
      .filter((x) => x.email || x.username);

    if (items.length === 0) return res.status(400).json({ error: "csv boş" });
    if (items.length > 300) return res.status(400).json({ error: "csv_limit_300" });

    const created = [];
    const existed = [];
    const failures = [];

    for (const row of items) {
      try {
        const email = row.email ? row.email.toLowerCase() : "";
        let u = null;
        if (email) u = await User.findOne({ email });
        if (!u && row.username) u = await User.findOne({ username: row.username });

        let tempPassword = null;
        if (!u) {
          let baseUsername = row.username;
          if (!baseUsername) baseUsername = email ? email.split("@")[0] : "student";
          baseUsername = baseUsername.replace(/\s+/g, "").slice(0, 24) || "student";
          let finalUsername = baseUsername;
          let counter = 1;
          while (await User.findOne({ username: finalUsername })) {
            finalUsername = `${baseUsername}${counter}`;
            counter += 1;
            if (counter > 2000) throw new Error("username_generation_failed");
          }

          tempPassword = randomTempPassword();
          const hashed = await bcrypt.hash(tempPassword, 10);
          u = await User.create({
            username: finalUsername,
            email: email || undefined,
            isVerified: true,
            password: hashed,
            role: "student",
            stats: { studied: 0, known: 0, unknown: 0 },
            streak: 0,
            badges: [BADGES.NEWBIE.id]
          });
          created.push({ id: u._id, username: u.username, email: u.email || null, tempPassword });
        } else {
          existed.push({ id: u._id, username: u.username, email: u.email || null });
        }

        await ClassMembership.findOneAndUpdate(
          { classId: classroom._id, studentId: u._id },
          { $setOnInsert: { joinedAt: new Date() } },
          { upsert: true }
        );
      } catch (e) {
        failures.push({ row, error: e.message || "error" });
      }
    }

    res.json({ ok: true, created, existed, failures });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/classes/me', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "student")) return res.status(403).json({ error: "student_only" });
  try {
    const memberships = await ClassMembership.find({ studentId: user._id }).sort({ createdAt: -1 }).limit(30).lean();
    const classIds = memberships.map((m) => m.classId);
    const classes = await Classroom.find({ _id: { $in: classIds } }).lean();
    const map = new Map(classes.map((c) => [String(c._id), c]));
    const items = memberships
      .map((m) => map.get(String(m.classId)))
      .filter(Boolean)
      .map((c) => ({ id: c._id, name: c.name, code: c.code }));
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/classes/:id/students', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });
  try {
    const id = String(req.params.id || "").trim();
    const classroom = await Classroom.findById(id);
    if (!classroom) return res.status(404).json({ error: "class_not_found" });
    if (String(classroom.teacherId) !== String(user._id) && user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
    const mem = await ClassMembership.find({ classId: classroom._id }).lean();
    const ids = mem.map((m) => m.studentId);
    const students = await User.find({ _id: { $in: ids } })
      .select("username nickname avatar stats streak lastStudyDate badges createdAt")
      .lean();
    res.json({ ok: true, items: students });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/classes/:id/dashboard', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });
  try {
    const id = String(req.params.id || "").trim();
    const classroom = await Classroom.findById(id);
    if (!classroom) return res.status(404).json({ error: "class_not_found" });
    if (String(classroom.teacherId) !== String(user._id) && user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }
    const memCount = await ClassMembership.countDocuments({ classId: classroom._id });
    const recentActive = await User.find({ lastStudyDate: { $exists: true, $ne: null } })
      .sort({ lastStudyDate: -1 })
      .limit(10)
      .select("username nickname avatar stats streak lastStudyDate")
      .lean();
    res.json({
      ok: true,
      classroom: { id: classroom._id, name: classroom.name, code: classroom.code },
      memberCount: memCount,
      recentActive
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/classes/:id/analytics', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ensureRole(user, "teacher")) return res.status(403).json({ error: "teacher_only" });
  try {
    const id = String(req.params.id || "").trim();
    const classroom = await Classroom.findById(id);
    if (!classroom) return res.status(404).json({ error: "class_not_found" });
    if (String(classroom.teacherId) !== String(user._id) && user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }

    const mem = await ClassMembership.find({ classId: classroom._id }).lean();
    const studentIds = mem.map((m) => m.studentId);

    const days = Math.min(60, Math.max(7, parseInt(req.query.days, 10) || 14));
    const since = new Date(Date.now() - days * 86400000);

    const daily = await ProgressEvent.aggregate([
      { $match: { userId: { $in: studentIds }, ts: { $gte: since } } },
      {
        $group: {
          _id: { day: { $dateToString: { date: "$ts", format: "%Y-%m-%d" } } },
          attempts: { $sum: 1 },
          known: { $sum: "$deltaKnown" },
          unknown: { $sum: "$deltaUnknown" },
          activeUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          day: "$_id.day",
          attempts: 1,
          known: 1,
          unknown: 1,
          active: { $size: "$activeUsers" }
        }
      },
      { $sort: { day: 1 } }
    ]);

    const recent = await ProgressEvent.find({ userId: { $in: studentIds }, ts: { $gte: since } })
      .sort({ ts: -1 })
      .limit(80)
      .lean();

    res.json({
      ok: true,
      classroom: { id: classroom._id, name: classroom.name, code: classroom.code },
      memberCount: studentIds.length,
      daily,
      recent
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- AI Mode (Groq veya Anthropic; AI_PROVIDER / GROQ_API_KEY → createAiProvider) ---
app.post('/api/ai/write', aiLimiter, async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const premium = hasUnlimitedAiMode(user);
    const FREE_LIMIT = 3;
    if (!premium && !isFreeAiAllowed(user, FREE_LIMIT)) {
      return res.status(402).json({ error: "free_limit_reached", limitPerDay: FREE_LIMIT });
    }

    const { type, tone, length, language, audience, context, inputText } = req.body || {};
    const input = String(inputText || "").trim();
    if (!input || input.length < 3) return res.status(400).json({ error: "inputText gerekli" });

    const { system, messages } = buildWritingPrompt({ type, tone, length, language, audience, context, inputText: input });
    const model = getAiModel(aiProviderName);

    const startedAt = Date.now();
    const rawResp = await aiProvider.createMessage({
      model,
      max_tokens: 900,
      temperature: 0.85,
      system,
      messages
    });
    const { body: resp, wbLog } = splitAiMessageResponse(rawResp);
    const logProvider = wbLog?.provider || aiProviderName;
    const logModel = wbLog?.model || model;

    const text = (resp?.content || [])
      .map((c) => (c && c.type === "text" ? c.text : ""))
      .join("\n")
      .trim();

    applyDailyAiUsage(user, 1);
    await user.save();

    // DB logging (masked)
    const elapsedMs = Date.now() - startedAt;
    try {
      await AiLog.create({
        userId: user._id,
        mode: "write",
        provider: logProvider,
        model: logModel,
        requestMeta: { type, tone, length, language, audience, context, premium },
        promptMasked: guardAiPromptLogging(JSON.stringify({ system, messages })),
        outputMasked: guardAiPromptLogging(text),
        usage: resp?.usage || null,
        elapsedMs
      });
    } catch (_) {
      // ignore log failures
    }

    res.json({
      ok: true,
      text,
      usage: resp?.usage || null,
      isPremium: premium,
      dayKey: user.aiUsage?.dayKey || todayKey(),
      usedToday: user.aiUsage?.count || 0,
      limitPerDay: premium ? null : FREE_LIMIT
    });
  } catch (e) {
    const f = formatAiError(e, aiProviderName);
    res.status(f.http).json({ error: f.message, code: f.code });
  }
});

app.post('/api/ai/rewrite', aiLimiter, async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const premium = hasUnlimitedAiMode(user);
    const FREE_LIMIT = 3;
    if (!premium && !isFreeAiAllowed(user, FREE_LIMIT)) {
      return res.status(402).json({ error: "free_limit_reached", limitPerDay: FREE_LIMIT });
    }

    const { mode, tone, language, inputText } = req.body || {};
    const input = String(inputText || "").trim();
    if (!input || input.length < 3) return res.status(400).json({ error: "inputText gerekli" });
    const m = String(mode || "humanize").toLowerCase();
    const tn = String(tone || "casual").toLowerCase();
    const lang = String(language || "tr").toLowerCase();

    const directive =
      m === "clarity"
        ? "Metni daha net ve anlaşılır hale getir; anlamı koru."
        : m === "shorten"
        ? "Metni kısalt; en önemli noktaları koru."
        : m === "expand"
        ? "Metni uzat; örnekler ve detaylarla zenginleştir."
        : m === "tone"
        ? `Metnin tonunu şu tona çevir: ${tn}.`
        : "Metni daha insani/doğal yaz; robotik ifadeleri azalt, tekrarları kır.";

    const model = getAiModel(aiProviderName);
    const startedAt = Date.now();
    const rewriteSystem =
      "Sen bir yeniden yazım/editing asistanısın. Çıktı doğal, insan gibi, akıcı olmalı.\n" +
      "- Klişe kalıplardan kaçın, cümle yapısını çeşitlendir.\n" +
      "- Gereksiz tekrar yapma.\n" +
      "- Dil: " +
      lang;
    const rawResp = await aiProvider.createMessage({
      model,
      max_tokens: 900,
      temperature: 0.9,
      system: rewriteSystem,
      messages: [{ role: "user", content: `${directive}\n\nMetin:\n${input}` }]
    });
    const { body: resp, wbLog } = splitAiMessageResponse(rawResp);
    const logProvider = wbLog?.provider || aiProviderName;
    const logModel = wbLog?.model || model;

    const text = (resp?.content || [])
      .map((c) => (c && c.type === "text" ? c.text : ""))
      .join("\n")
      .trim();

    applyDailyAiUsage(user, 1);
    await user.save();

    const elapsedMs = Date.now() - startedAt;
    try {
      await AiLog.create({
        userId: user._id,
        mode: "rewrite",
        provider: logProvider,
        model: logModel,
        requestMeta: { mode: m, tone: tn, language: lang, premium },
        promptMasked: guardAiPromptLogging(`${directive}\n\n${input}`),
        outputMasked: guardAiPromptLogging(text),
        usage: resp?.usage || null,
        elapsedMs
      });
    } catch (_) {}

    res.json({
      ok: true,
      text,
      usage: resp?.usage || null,
      isPremium: premium,
      dayKey: user.aiUsage?.dayKey || todayKey(),
      usedToday: user.aiUsage?.count || 0,
      limitPerDay: premium ? null : FREE_LIMIT
    });
  } catch (e) {
    const f = formatAiError(e, aiProviderName);
    res.status(f.http).json({ error: f.message, code: f.code });
  }
});

function sseWrite(res, event, data) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (_) {
    /* ignore */
  }
}

function setSseHeaders(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

app.post('/api/ai/write/stream', aiLimiter, async (req, res) => {
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const premium = hasUnlimitedAiMode(user);
    const FREE_LIMIT = 3;
    if (!premium && !isFreeAiAllowed(user, FREE_LIMIT)) {
      return res.status(402).json({ error: "free_limit_reached", limitPerDay: FREE_LIMIT });
    }

    const { type, tone, length, language, audience, context, inputText } = req.body || {};
    const input = String(inputText || "").trim();
    if (!input || input.length < 3) return res.status(400).json({ error: "inputText gerekli" });

    const { system, messages } = buildWritingPrompt({ type, tone, length, language, audience, context, inputText: input });
    const model = getAiModel(aiProviderName);

    setSseHeaders(res);
    sseWrite(res, "meta", { ok: true, mode: "write", isPremium: premium });

    const startedAt = Date.now();
    const streamRaw = await aiProvider.createMessageStream({
      model,
      max_tokens: 900,
      temperature: 0.85,
      system,
      messages
    });
    const { iterable: stream, metaRef: writeStreamMeta } = normalizeAiStreamResult(streamRaw);
    const logProvider = writeStreamMeta?.provider || aiProviderName;
    const logModel = writeStreamMeta?.model || model;

    let out = "";
    let usage = null;

    for await (const event of stream) {
      if (aborted) break;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const chunk = String(event.delta.text || "");
        if (chunk) {
          out += chunk;
          sseWrite(res, "text", { text: chunk });
        }
      }
      if (event?.type === "message_delta" && event.usage) {
        usage = event.usage;
      }
      if (event?.type === "message_stop" && event.message?.usage) {
        usage = event.message.usage;
      }
    }

    if (!aborted) {
      applyDailyAiUsage(user, 1);
      await user.save();
      const elapsedMs = Date.now() - startedAt;
      try {
        await AiLog.create({
          userId: user._id,
          mode: "write_stream",
          provider: logProvider,
          model: logModel,
          requestMeta: { type, tone, length, language, audience, context, premium },
          promptMasked: guardAiPromptLogging(JSON.stringify({ system, messages })),
          outputMasked: guardAiPromptLogging(out),
          usage,
          elapsedMs
        });
      } catch (_) {}
      sseWrite(res, "done", {
        text: out,
        usage,
        dayKey: user.aiUsage?.dayKey || todayKey(),
        usedToday: user.aiUsage?.count || 0,
        limitPerDay: premium ? null : FREE_LIMIT
      });
      res.end();
    } else {
      res.end();
    }
  } catch (e) {
    const f = formatAiError(e, aiProviderName);
    try {
      if (!res.headersSent) return res.status(f.http).json({ error: f.message, code: f.code });
      sseWrite(res, "error", { error: f.message, code: f.code });
      res.end();
    } catch (_) {
      /* ignore */
    }
  }
});

app.post('/api/ai/rewrite/stream', aiLimiter, async (req, res) => {
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });
  try {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: "Token gerekli" });
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const premium = hasUnlimitedAiMode(user);
    const FREE_LIMIT = 3;
    if (!premium && !isFreeAiAllowed(user, FREE_LIMIT)) {
      return res.status(402).json({ error: "free_limit_reached", limitPerDay: FREE_LIMIT });
    }

    const { mode, tone, language, inputText } = req.body || {};
    const input = String(inputText || "").trim();
    if (!input || input.length < 3) return res.status(400).json({ error: "inputText gerekli" });

    const m = String(mode || "humanize").toLowerCase();
    const tn = String(tone || "casual").toLowerCase();
    const lang = String(language || "tr").toLowerCase();

    const directive =
      m === "clarity"
        ? "Metni daha net ve anlaşılır hale getir; anlamı koru."
        : m === "shorten"
        ? "Metni kısalt; en önemli noktaları koru."
        : m === "expand"
        ? "Metni uzat; örnekler ve detaylarla zenginleştir."
        : m === "tone"
        ? `Metnin tonunu şu tona çevir: ${tn}.`
        : "Metni daha insani/doğal yaz; robotik ifadeleri azalt, tekrarları kır.";

    const model = getAiModel(aiProviderName);

    setSseHeaders(res);
    sseWrite(res, "meta", { ok: true, mode: "rewrite", isPremium: premium });

    const rewriteSystem =
      "Sen bir yeniden yazım/editing asistanısın. Çıktı doğal, insan gibi, akıcı olmalı.\n" +
      "- Klişe kalıplardan kaçın, cümle yapısını çeşitlendir.\n" +
      "- Gereksiz tekrar yapma.\n" +
      "- Dil: " +
      lang;

    const startedAt = Date.now();
    const streamRaw = await aiProvider.createMessageStream({
      model,
      max_tokens: 900,
      temperature: 0.9,
      system: rewriteSystem,
      messages: [{ role: "user", content: `${directive}\n\nMetin:\n${input}` }]
    });
    const { iterable: stream, metaRef: rewriteStreamMeta } = normalizeAiStreamResult(streamRaw);
    const logProvider = rewriteStreamMeta?.provider || aiProviderName;
    const logModel = rewriteStreamMeta?.model || model;

    let out = "";
    let usage = null;

    for await (const event of stream) {
      if (aborted) break;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const chunk = String(event.delta.text || "");
        if (chunk) {
          out += chunk;
          sseWrite(res, "text", { text: chunk });
        }
      }
      if (event?.type === "message_delta" && event.usage) {
        usage = event.usage;
      }
      if (event?.type === "message_stop" && event.message?.usage) {
        usage = event.message.usage;
      }
    }

    if (!aborted) {
      applyDailyAiUsage(user, 1);
      await user.save();
      const elapsedMs = Date.now() - startedAt;
      try {
        await AiLog.create({
          userId: user._id,
          mode: "rewrite_stream",
          provider: logProvider,
          model: logModel,
          requestMeta: { mode: m, tone: tn, language: lang, premium },
          promptMasked: guardAiPromptLogging(`${directive}\n\n${input}`),
          outputMasked: guardAiPromptLogging(out),
          usage,
          elapsedMs
        });
      } catch (_) {}
      sseWrite(res, "done", {
        text: out,
        usage,
        dayKey: user.aiUsage?.dayKey || todayKey(),
        usedToday: user.aiUsage?.count || 0,
        limitPerDay: premium ? null : FREE_LIMIT
      });
      res.end();
    } else {
      res.end();
    }
  } catch (e) {
    const f = formatAiError(e, aiProviderName);
    try {
      if (!res.headersSent) return res.status(f.http).json({ error: f.message, code: f.code });
      sseWrite(res, "error", { error: f.message, code: f.code });
      res.end();
    } catch (_) {}
  }
});

// --- AI Sohbet (Premium veya AI+; çoklu thread + dosya ekleri + bellek özeti) ---
async function loadAiChatUser(req, res) {
  const token = req.headers.authorization;
  if (!token) {
    res.status(401).json({ error: "Token gerekli" });
    return null;
  }
  try {
    const decoded = jwt.verify(getAuthTokenFromHeader(req), JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(404).json({ error: "Kullanıcı bulunamadı" });
      return null;
    }
    if (!hasUnlimitedAiMode(user)) {
      res.status(403).json({
        error: "ai_chat_premium_required",
        message: "AI Sohbet yalnızca Premium veya AI+ üyelikle kullanılabilir.",
      });
      return null;
    }
    return user;
  } catch (e) {
    res.status(401).json({ error: "Auth error" });
    return null;
  }
}

app.get("/api/ai/chat/threads", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const rows = await AiChatThread.find({ userId: user._id })
      .sort({ updatedAt: -1 })
      .limit(80)
      .select("title updatedAt messages")
      .lean();
    const threads = rows.map((row) => {
      const msgs = row.messages || [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      const preview = last
        ? clipChatText(String(last.content || "").replace(/\n/g, " "), 72)
        : "";
      return {
        id: String(row._id),
        title: row.title || "Yeni sohbet",
        updatedAt: row.updatedAt,
        messageCount: msgs.length,
        preview,
      };
    });
    res.json({ ok: true, threads });
  } catch (e) {
    res.status(500).json({ error: "threads_list_failed" });
  }
});

app.post("/api/ai/chat/threads", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const titleIn = String(req.body?.title || "").trim().slice(0, 120);
    const thread = await AiChatThread.create({
      userId: user._id,
      title: titleIn || "Yeni sohbet",
      messages: [],
    });
    res.json({
      ok: true,
      thread: {
        id: String(thread._id),
        title: thread.title,
        updatedAt: thread.updatedAt,
        messageCount: 0,
        preview: "",
      },
    });
  } catch (e) {
    res.status(500).json({ error: "thread_create_failed" });
  }
});

app.patch("/api/ai/chat/threads/:threadId", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const tid = req.params.threadId;
    if (!mongoose.isValidObjectId(tid)) return res.status(400).json({ error: "invalid_thread" });
    const title = String(req.body?.title || "").trim().slice(0, 120);
    if (!title) return res.status(400).json({ error: "title gerekli" });
    const thread = await AiChatThread.findOneAndUpdate(
      { _id: tid, userId: user._id },
      { $set: { title } },
      { new: true }
    ).lean();
    if (!thread) return res.status(404).json({ error: "thread_not_found" });
    res.json({ ok: true, id: thread._id, title: thread.title });
  } catch (e) {
    res.status(500).json({ error: "thread_patch_failed" });
  }
});

app.delete("/api/ai/chat/threads/:threadId", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const tid = req.params.threadId;
    if (!mongoose.isValidObjectId(tid)) return res.status(400).json({ error: "invalid_thread" });
    const r = await AiChatThread.deleteOne({ _id: tid, userId: user._id });
    if (!r.deletedCount) return res.status(404).json({ error: "thread_not_found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "thread_delete_failed" });
  }
});

app.get("/api/ai/chat", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const qid = req.query.threadId ? String(req.query.threadId) : "";
    let thread = null;
    if (qid && mongoose.isValidObjectId(qid)) {
      thread = await AiChatThread.findOne({ _id: qid, userId: user._id }).lean();
    }
    if (!thread) {
      thread = await AiChatThread.findOne({ userId: user._id }).sort({ updatedAt: -1 }).lean();
    }
    if (!thread) {
      return res.json({ ok: true, messages: [], threadId: null, title: null });
    }
    const messages = (thread.messages || []).map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      files: Array.isArray(m.files) ? m.files : [],
      createdAt: m.createdAt,
    }));
    res.json({
      ok: true,
      messages,
      threadId: String(thread._id),
      title: thread.title || "Yeni sohbet",
    });
  } catch (e) {
    res.status(401).json({ error: "Auth error" });
  }
});

app.delete("/api/ai/chat", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;
    const tid = req.query.threadId ? String(req.query.threadId) : "";
    if (!tid || !mongoose.isValidObjectId(tid)) {
      return res.status(400).json({ error: "threadId gerekli" });
    }
    const r = await AiChatThread.deleteOne({ _id: tid, userId: user._id });
    if (!r.deletedCount) return res.status(404).json({ error: "thread_not_found" });
    res.json({ ok: true });
  } catch (e) {
    res.status(401).json({ error: "Auth error" });
  }
});

app.post("/api/ai/chat/stream", aiLimiter, async (req, res) => {
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;

    const rawMsg = String(req.body?.message || "").trim();
    const attachments = normalizeChatAttachments(req.body?.attachments);
    if (!rawMsg && attachments.length === 0) {
      return res.status(400).json({ error: "message veya ek gerekli" });
    }
    if (rawMsg.length > CHAT_USER_MESSAGE_MAX) {
      return res.status(400).json({ error: "message_too_long", max: CHAT_USER_MESSAGE_MAX });
    }

    const merged = buildUserMessageWithAttachments(rawMsg, attachments);
    if (merged.length > CHAT_MERGED_BODY_MAX) {
      return res.status(400).json({ error: "message_with_attachments_too_long" });
    }

    const bodyTid = req.body?.threadId ? String(req.body.threadId) : "";
    let thread = null;
    if (bodyTid && mongoose.isValidObjectId(bodyTid)) {
      thread = await AiChatThread.findOne({ _id: bodyTid, userId: user._id });
      if (!thread) {
        return res.status(404).json({ error: "thread_not_found" });
      }
    } else {
      thread = await AiChatThread.create({ userId: user._id, title: "Yeni sohbet", messages: [] });
    }

    const fileMeta = attachments.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
    }));

    thread.messages.push({
      role: "user",
      content: merged,
      files: fileMeta,
      createdAt: new Date(),
    });
    if (thread.messages.length > CHAT_MAX_STORED_MESSAGES) {
      thread.messages = thread.messages.slice(-CHAT_MAX_STORED_MESSAGES);
    }
    maybeAutoTitleChatThread(thread);
    await thread.save();

    const apiMessages = chatApiMessageSlice(thread);
    const display =
      (user.nickname && String(user.nickname).trim()) ||
      (user.username && String(user.username).trim()) ||
      "öğrenci";
    const system = buildChatSystemPrompt(thread.memorySummary, display, user);
    const model = getAiModel(aiProviderName);

    setSseHeaders(res);
    sseWrite(res, "meta", {
      ok: true,
      mode: "chat",
      threadId: String(thread._id),
    });

    const startedAt = Date.now();
    const streamRaw = await aiProvider.createMessageStream({
      model,
      max_tokens: 4096,
      temperature: 0.82,
      system,
      messages: apiMessages,
    });
    const { iterable: stream, metaRef: chatStreamMeta } = normalizeAiStreamResult(streamRaw);
    const logProvider = chatStreamMeta?.provider || aiProviderName;
    const logModel = chatStreamMeta?.model || model;

    let out = "";
    let usage = null;

    for await (const event of stream) {
      if (aborted) break;
      if (event?.type === "content_block_delta" && event.delta?.type === "text_delta") {
        const chunk = String(event.delta.text || "");
        if (chunk) {
          out += chunk;
          sseWrite(res, "text", { text: chunk });
        }
      }
      if (event?.type === "message_delta" && event.usage) {
        usage = event.usage;
      }
      if (event?.type === "message_stop" && event.message?.usage) {
        usage = event.message.usage;
      }
    }

    if (!aborted) {
      const storedAssistant = clipChatText(out, CHAT_ASSISTANT_STORE_MAX);
      const t2 = await AiChatThread.findById(thread._id);
      if (t2) {
        t2.messages.push({ role: "assistant", content: storedAssistant, createdAt: new Date() });
        if (t2.messages.length > CHAT_MAX_STORED_MESSAGES) {
          t2.messages = t2.messages.slice(-CHAT_MAX_STORED_MESSAGES);
        }
        maybeAutoTitleChatThread(t2);
        await t2.save();
        setImmediate(() => {
          maybeUpdateChatMemorySummary(t2._id).catch(() => {});
        });
      }

      applyDailyAiUsage(user, 1);
      await user.save();

      const elapsedMs = Date.now() - startedAt;
      try {
        await AiLog.create({
          userId: user._id,
          mode: "chat_stream",
          provider: logProvider,
          model: logModel,
          requestMeta: { premium: true, threadId: String(thread._id), attachmentCount: attachments.length },
          promptMasked: guardAiPromptLogging(
            JSON.stringify({
              systemPreview: system.slice(0, 400),
              userMsgLen: merged.length,
              attachmentCount: attachments.length,
            })
          ),
          outputMasked: guardAiPromptLogging(storedAssistant),
          usage,
          elapsedMs,
        });
      } catch (_) {}

      sseWrite(res, "done", {
        text: out,
        usage,
        threadId: String(thread._id),
        dayKey: user.aiUsage?.dayKey || todayKey(),
        usedToday: user.aiUsage?.count || 0,
        limitPerDay: null,
      });
      res.end();
    } else {
      res.end();
    }
  } catch (e) {
    const f = formatAiError(e, aiProviderName);
    try {
      if (!res.headersSent) return res.status(f.http).json({ error: f.message, code: f.code });
      sseWrite(res, "error", { error: f.message, code: f.code });
      res.end();
    } catch (_) {}
  }
});

// --- AI Tools: Vision (görsel okuma) + Image generation (görsel üretme) ---
function getAiGatewayKeyForTools() {
  return String(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY || "").trim();
}

function getAiGatewayBaseForTools() {
  const raw = String(process.env.AI_GATEWAY_BASE_URL || process.env.VERCEL_AI_GATEWAY_BASE_URL || "https://ai-gateway.vercel.sh/v1").trim();
  return raw.replace(/\/$/, "");
}

function getAiVisionModelForTools() {
  // AI Gateway model is usually "openai/gpt-4o-mini" which supports vision when message content is multimodal.
  return String(process.env.AI_VISION_MODEL || process.env.AI_GATEWAY_MODEL || process.env.VERCEL_AI_GATEWAY_MODEL || "openai/gpt-4o-mini").trim();
}

function getAiImageModelForTools() {
  // Vercel AI Gateway typically supports OpenAI Images API; default chosen to match OpenAI Images.
  return String(process.env.AI_IMAGE_MODEL || "gpt-image-1").trim();
}

function isProbablyDataUrlImage(s) {
  const v = String(s || "").trim();
  return /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(v);
}

app.post("/api/ai/vision/describe", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;

    const key = getAiGatewayKeyForTools();
    if (!key) return res.status(503).json({ error: "ai_gateway_required", message: "Görsel okuma için AI Gateway (AI_GATEWAY_API_KEY) gerekli." });

    const imageDataUrl = String(req.body?.imageDataUrl || "").trim();
    if (!isProbablyDataUrlImage(imageDataUrl)) {
      return res.status(400).json({ error: "invalid_image", message: "Geçersiz görsel. PNG/JPG/WEBP/GIF data URL bekleniyor." });
    }

    const prompt = String(req.body?.prompt || "").trim();
    const userPrompt = prompt || "Bu görselde ne var? Metin varsa çıkar ve özetle. Sonra YDT odaklı kısa açıklama ve 3 soru üret.";

    const base = getAiGatewayBaseForTools();
    const model = getAiVisionModelForTools();

    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Kısa, net ve hatasız Türkçe yaz. Gereksiz uzatma. Markdown kullanabilirsin." },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: 0.35,
        max_tokens: 1200,
      }),
    });

    const textBody = await r.text();
    let json = {};
    try {
      json = textBody ? JSON.parse(textBody) : {};
    } catch {
      json = { error: { message: textBody.slice(0, 200) } };
    }
    if (!r.ok) {
      const msg = String(json?.error?.message || json?.message || "vision_error");
      return res.status(r.status).json({ error: msg });
    }
    const outText = String(json?.choices?.[0]?.message?.content || "").trim();
    return res.json({ ok: true, text: outText });
  } catch (e) {
    const msg = String(e?.message || "vision_failed");
    res.status(500).json({ error: msg });
  }
});

app.post("/api/ai/image/generate", aiLimiter, async (req, res) => {
  try {
    const user = await loadAiChatUser(req, res);
    if (!user) return;

    const key = getAiGatewayKeyForTools();
    if (!key) return res.status(503).json({ error: "ai_gateway_required", message: "Görsel üretmek için AI Gateway (AI_GATEWAY_API_KEY) gerekli." });

    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) return res.status(400).json({ error: "prompt_required" });

    const size = String(req.body?.size || "1024x1024").trim();
    const okSize = ["512x512", "1024x1024", "1024x1536", "1536x1024"].includes(size) ? size : "1024x1024";

    const base = getAiGatewayBaseForTools();
    const model = getAiImageModelForTools();

    const r = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        size: okSize,
        response_format: "b64_json",
      }),
    });

    const textBody = await r.text();
    let json = {};
    try {
      json = textBody ? JSON.parse(textBody) : {};
    } catch {
      json = { error: { message: textBody.slice(0, 200) } };
    }
    if (!r.ok) {
      const msg = String(json?.error?.message || json?.message || "image_gen_error");
      return res.status(r.status).json({ error: msg });
    }
    const b64 = String(json?.data?.[0]?.b64_json || "").trim();
    if (!b64) return res.status(502).json({ error: "image_empty" });
    // PNG varsayımı (OpenAI Images genelde png döndürür)
    return res.json({ ok: true, imageDataUrl: `data:image/png;base64,${b64}` });
  } catch (e) {
    const msg = String(e?.message || "image_gen_failed");
    res.status(500).json({ error: msg });
  }
});

app.get("/api/admin/ai-providers", requireAdmin, (req, res) => {
  try {
    res.json(getAiAdminSnapshot());
  } catch (e) {
    pushAdminError(e.message, { path: "admin/ai-providers" });
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
    const now = new Date();
    const [
      total,
      withEmail,
      verified,
      googleLinked,
      withPassword,
      premiumActive,
      aiPlusEntitled
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ email: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ googleId: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({ password: { $exists: true, $nin: [null, ''] } }),
      User.countDocuments({ premiumUntil: { $gt: now } }),
      User.countDocuments({ 'entitlements.aiPlus': true })
    ]);
    res.json({
      ok: true,
      total,
      withEmail,
      verified,
      googleLinked,
      withPassword,
      premiumActive,
      aiPlusEntitled
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
    const sortField = ['createdAt', 'username', 'lastStudyDate', 'streak', 'premiumUntil'].includes(req.query.sort)
      ? req.query.sort
      : 'createdAt';
    const order = req.query.order === 'asc' ? 1 : -1;
    const now = new Date();

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
    if (req.query.premium === 'active') {
      conditions.push({ premiumUntil: { $gt: now } });
    }
    if (req.query.premium === 'none') {
      conditions.push({
        $or: [
          { premiumUntil: { $exists: false } },
          { premiumUntil: null },
          { premiumUntil: { $lte: now } }
        ]
      });
    }
    if (req.query.premium === 'aiplus') {
      conditions.push({ 'entitlements.aiPlus': true });
    }
    if (req.query.role === "teacher" || req.query.role === "student" || req.query.role === "admin") {
      conditions.push({ role: req.query.role });
    }
    if (req.query.role === "staff") {
      conditions.push({ role: { $in: ["teacher", "admin"] } });
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
      const premiumUntil = u.premiumUntil || null;
      return {
      _id: u._id,
      username: u.username,
      nickname: u.nickname || '',
      email: u.email || null,
      role: u.role || 'student',
      isVerified: Boolean(u.isVerified),
      hasGoogle: Boolean(u.googleId),
      hasPassword,
      bio: u.bio || '',
      avatar: u.avatar || '',
      stats: u.stats || { studied: 0, known: 0, unknown: 0 },
      streak: u.streak ?? 0,
      lastStudyDate: u.lastStudyDate || null,
      badges: (u.badges || []).slice(0, 30),
      createdAt: u.createdAt || null,
      premiumUntil,
      isPremium: isPremiumUser({ premiumUntil }),
      entitlements: u.entitlements && typeof u.entitlements === 'object' ? u.entitlements : {}
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

app.get("/api/admin/classrooms", requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const orgGroup = String(req.query.orgGroup || "").trim();
    const conditions = [];
    if (q) {
      const rx = escapeRegex(q);
      conditions.push({
        $or: [
          { name: { $regex: rx, $options: "i" } },
          { code: { $regex: rx, $options: "i" } },
          { schoolName: { $regex: rx, $options: "i" } },
          { gradeLabel: { $regex: rx, $options: "i" } },
          { orgGroup: { $regex: rx, $options: "i" } },
        ],
      });
    }
    if (orgGroup) conditions.push({ orgGroup });
    const filter = conditions.length === 0 ? {} : { $and: conditions };

    const list = await Classroom.find(filter)
      .sort({ updatedAt: -1 })
      .populate("teacherId", "username nickname email role")
      .limit(200)
      .lean();

    const ids = list.map((c) => c._id);
    let countMap = {};
    if (ids.length) {
      const agg = await ClassMembership.aggregate([
        { $match: { classId: { $in: ids } } },
        { $group: { _id: "$classId", n: { $sum: 1 } } },
      ]);
      countMap = Object.fromEntries(agg.map((x) => [String(x._id), x.n]));
    }

    const items = list.map((c) => ({
      ...c,
      memberCount: countMap[String(c._id)] || 0,
    }));

    res.json({ ok: true, items });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/classrooms" });
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/classrooms", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const teacherIdRaw = req.body?.teacherId;
    if (!name || name.length < 2) return res.status(400).json({ error: "name gerekli (min 2 karakter)" });
    if (!teacherIdRaw) return res.status(400).json({ error: "teacherId gerekli" });

    const teacher = await User.findById(teacherIdRaw);
    if (!teacher) return res.status(404).json({ error: "teacher_not_found" });
    if (teacher.role !== "teacher" && teacher.role !== "admin") {
      return res.status(400).json({ error: "user_must_be_teacher_or_admin" });
    }

    let code = generateClassCode();
    for (let i = 0; i < 10; i += 1) {
      const exists = await Classroom.findOne({ code });
      if (!exists) break;
      code = generateClassCode();
    }

    const tags = Array.isArray(req.body?.tags)
      ? req.body.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 24)
      : String(req.body?.tagsText || "")
          .split(/[,;]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 24);

    const doc = await Classroom.create({
      name,
      teacherId: teacher._id,
      code,
      description: String(req.body?.description || "").trim(),
      schoolName: String(req.body?.schoolName || "").trim(),
      gradeLabel: String(req.body?.gradeLabel || "").trim(),
      orgGroup: String(req.body?.orgGroup || "").trim(),
      tags,
      adminNote: String(req.body?.adminNote || "").trim(),
      createdByAdmin: true,
    });

    const populated = await Classroom.findById(doc._id).populate("teacherId", "username nickname email role").lean();
    const memN = await ClassMembership.countDocuments({ classId: doc._id });
    res.json({ ok: true, classroom: { ...populated, memberCount: memN } });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/classrooms POST" });
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/classrooms/:id", requireAdmin, async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) return res.status(404).json({ error: "class_not_found" });

    if (req.body.name != null) {
      const n = String(req.body.name || "").trim();
      if (n.length >= 2) classroom.name = n;
    }
    if (req.body.description !== undefined) classroom.description = String(req.body.description || "").trim();
    if (req.body.schoolName !== undefined) classroom.schoolName = String(req.body.schoolName || "").trim();
    if (req.body.gradeLabel !== undefined) classroom.gradeLabel = String(req.body.gradeLabel || "").trim();
    if (req.body.orgGroup !== undefined) classroom.orgGroup = String(req.body.orgGroup || "").trim();
    if (req.body.adminNote !== undefined) classroom.adminNote = String(req.body.adminNote || "").trim();

    if (req.body.tags != null) {
      classroom.tags = Array.isArray(req.body.tags)
        ? req.body.tags.map((t) => String(t || "").trim()).filter(Boolean).slice(0, 24)
        : [];
    }

    if (req.body.teacherId) {
      const t = await User.findById(req.body.teacherId);
      if (!t) return res.status(404).json({ error: "teacher_not_found" });
      if (t.role !== "teacher" && t.role !== "admin") {
        return res.status(400).json({ error: "user_must_be_teacher_or_admin" });
      }
      classroom.teacherId = t._id;
    }

    await classroom.save();
    const populated = await Classroom.findById(classroom._id).populate("teacherId", "username nickname email role").lean();
    const memN = await ClassMembership.countDocuments({ classId: classroom._id });
    res.json({ ok: true, classroom: { ...populated, memberCount: memN } });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/classrooms PATCH" });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/bulk-users', requireAdmin, async (req, res) => {
  try {
    const users = Array.isArray(req.body?.users) ? req.body.users : [];
    if (users.length === 0) return res.status(400).json({ error: "users gerekli" });
    if (users.length > 500) return res.status(400).json({ error: "limit_500" });

    const created = [];
    const failures = [];
    for (const row of users) {
      try {
        const email = String(row?.email || "").trim().toLowerCase();
        const role = ["student", "teacher", "admin"].includes(row?.role) ? row.role : "student";
        let username = String(row?.username || "").trim();
        if (!username) username = email ? email.split("@")[0] : "user";

        const exists = (email && (await User.findOne({ email }))) || (await User.findOne({ username }));
        if (exists) throw new Error("user_exists");

        let finalUsername = username.replace(/\s+/g, "").slice(0, 24) || "user";
        let counter = 1;
        while (await User.findOne({ username: finalUsername })) {
          finalUsername = `${username}${counter}`;
          counter += 1;
          if (counter > 2000) throw new Error("username_generation_failed");
        }

        const tempPassword = randomTempPassword();
        const hashed = await bcrypt.hash(tempPassword, 10);
        const u = await User.create({
          username: finalUsername,
          email: email || undefined,
          isVerified: true,
          password: hashed,
          role,
          stats: { studied: 0, known: 0, unknown: 0 },
          streak: 0,
          badges: [BADGES.NEWBIE.id]
        });
        created.push({ id: u._id, username: u.username, email: u.email || null, role, tempPassword });
      } catch (e) {
        failures.push({ row, error: e.message || "error" });
      }
    }
    res.json({ ok: true, created, failures });
  } catch (e) {
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

app.put('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const role = String(req.body?.role || '').trim();
    if (!id) return res.status(400).json({ error: 'id gerekli' });
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role geçersiz' });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    user.role = role;
    await user.save();
    res.json({ ok: true, user: { _id: user._id, username: user.username, role: user.role } });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/users/:id/role' });
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id/premium', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'id gerekli' });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

    // premiumUntil: ISO string | null
    const v = req.body?.premiumUntil;
    if (v === null || v === '' || v === false) {
      user.premiumUntil = null;
    } else {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'premiumUntil geçersiz tarih' });
      user.premiumUntil = d;
    }

    // Manuel AI+ (Paddle olmadan): entitlements.aiPlus
    if (typeof req.body?.aiPlus === 'boolean') {
      const next = { ...(user.entitlements || {}) };
      if (req.body.aiPlus) next.aiPlus = true;
      else delete next.aiPlus;
      user.entitlements = next;
      user.markModified('entitlements');
    }

    await user.save();
    res.json({
      ok: true,
      user: {
        _id: user._id,
        username: user.username,
        premiumUntil: user.premiumUntil || null,
        isPremium: isPremiumUser(user),
        entitlements: user.entitlements || {},
        hasUnlimitedAi: hasUnlimitedAiMode(user)
      }
    });
  } catch (e) {
    pushAdminError(e.message, { path: 'admin/users/:id/premium' });
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

// --- Admin: Kelime yönetimi (listele / güncelle / sil) ---
app.get("/api/admin/words", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 25));
    const q = String(req.query.q || "").trim();
    const level = String(req.query.level || "").trim().toUpperCase();
    const sortField = ["createdAt", "updatedAt", "term", "level"].includes(String(req.query.sort || "updatedAt"))
      ? String(req.query.sort || "updatedAt")
      : "updatedAt";
    const order = req.query.order === "asc" ? 1 : -1;

    const conditions = [];
    if (q) {
      const rx = escapeRegex(q);
      conditions.push({
        $or: [
          { term: { $regex: rx, $options: "i" } },
          { meaning: { $regex: rx, $options: "i" } },
          { hint: { $regex: rx, $options: "i" } },
          { example: { $regex: rx, $options: "i" } },
        ],
      });
    }
    if (["A1", "A2", "B1", "B2", "C1", "C2"].includes(level)) {
      conditions.push({ level });
    }
    const filter = conditions.length ? { $and: conditions } : {};

    const skip = (page - 1) * limit;
    const [total, items] = await Promise.all([
      Word.countDocuments(filter),
      Word.find(filter)
        .sort({ [sortField]: order })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      ok: true,
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/words" });
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/admin/words/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "invalid_word_id" });

    const term = req.body?.term != null ? String(req.body.term).trim() : undefined;
    const meaning = req.body?.meaning != null ? String(req.body.meaning).trim() : undefined;
    const hint = req.body?.hint != null ? String(req.body.hint).trim() : undefined;
    const example = req.body?.example != null ? String(req.body.example).trim() : undefined;
    const levelRaw = req.body?.level != null ? String(req.body.level).trim().toUpperCase() : undefined;
    const level = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(levelRaw) ? levelRaw : undefined;

    const patch = {};
    if (term !== undefined) patch.term = term;
    if (meaning !== undefined) patch.meaning = meaning;
    if (hint !== undefined) patch.hint = hint;
    if (example !== undefined) patch.example = example;
    if (level !== undefined) patch.level = level;

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: "no_changes" });
    if (patch.term !== undefined && !patch.term) return res.status(400).json({ error: "term_required" });
    if (patch.meaning !== undefined && !patch.meaning) return res.status(400).json({ error: "meaning_required" });

    const doc = await Word.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: "word_not_found" });
    res.json({ ok: true, word: doc });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/words/:id" });
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/admin/words/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id || "");
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "invalid_word_id" });
    const r = await Word.deleteOne({ _id: id });
    if (!r.deletedCount) return res.status(404).json({ error: "word_not_found" });
    res.json({ ok: true });
  } catch (e) {
    pushAdminError(e.message, { path: "admin/words/:id:delete" });
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

    const userAvatar = avatar || '??';

    console.log("Mongo'ya room yaz?l?yor...");

    let mongoRoom;
    let roomCode;
    for (let attempt = 0; attempt < 12; attempt++) {
      roomCode = generateRoomCode();
      try {
        mongoRoom = await Room.create({
          code: roomCode,
          host: username,
          users: [
            {
              username,
              avatar: "??",
              studied: 0,
              known: 0,
              unknown: 0,
            },
          ],
          isActive: true,
        });
        break;
      } catch (e) {
        if (e && e.code === 11000) continue;
        throw e;
      }
    }

    if (!mongoRoom) {
      callback?.({ success: false, error: "Oda kodu üretilemedi, tekrar dene" });
      return;
    }

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
