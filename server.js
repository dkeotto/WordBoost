require("dotenv").config();

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

const app = express();
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
 * onboarding@resend.dev = Resend "sandbox" gonderici; sadece hesapta dogrulanmis
 * alici adreslerine izin verir. Gercek kullanicilara mail icin domain dogrula veya SMTP kullan.
 */
function shouldSkipResendSandbox() {
  const from = (process.env.RESEND_FROM || '').toLowerCase();
  return from.includes('onboarding@resend.dev');
}

async function sendVerificationEmail(email, username, code) {
  console.log(`Sending verification email to ${email}...`);

  const subject = 'WordBoost Dogrulama Kodu';
  const text = `Merhaba ${username},\n\nHesabini dogrulamak icin kodun: ${code}\n\nBu kod 1 saat gecerlidir.\n\nWordBoost`;
  const html = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #FF9F1C;">WordBoost</h2>
          <p>Merhaba <strong>${username}</strong>,</p>
          <p>Hesabini dogrulamak icin asagidaki kodu kullanabilirsin:</p>
          <div style="background: #f4f4f4; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center; letter-spacing: 5px; color: #333;">
            ${code}
          </div>
          <p>Bu kod 1 saat sureyle gecerlidir.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">Bu islemi sen yapmad?ysan bu maili yok sayabilirsin.</p>
        </div>
      `;

  // 1) Resend (MAIL_FORCE_SMTP veya onboarding sandbox + SMTP varsa atla)
  const skipResend =
    envIsTrue('MAIL_FORCE_SMTP') ||
    (shouldSkipResendSandbox() && SMTP_USER && SMTP_PASS);

  if (process.env.RESEND_API_KEY && !skipResend) {
    const resendResult = await sendMailViaResend({ to: email, subject, html, text });
    if (resendResult.success) return resendResult;
    console.warn('Resend failed, trying SMTP:', resendResult.error);
  } else if (skipResend && shouldSkipResendSandbox()) {
    console.log('Skipping Resend (onboarding@resend.dev sandbox); using SMTP for all recipients.');
  }

  // 2) SMTP (Gmail vb.)
  if (!SMTP_USER || !SMTP_PASS) {
    console.error('SMTP skipped: EMAIL_USER / EMAIL_PASS not set');
    return { success: false, error: 'No mail provider configured (set RESEND_API_KEY or EMAIL_*)' };
  }

  const mailPromise = transporter.sendMail({
    from: `"WordBoost" <${SMTP_USER}>`,
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
  const subject = 'WordBoost Sifre Sifirlama';
  const text = `Sifreni sifirlamak icin kodun: ${resetCode}\n\nBu kod 1 saat gecerlidir.\n\nWordBoost`;
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #FF9F1C;">Sifre sifirlama</h2>
      <p>Kodun:</p>
      <div style="background: #f4f4f4; padding: 15px; border-radius: 10px; font-size: 24px; font-weight: bold; text-align: center;">${resetCode}</div>
      <p style="font-size: 12px; color: #999; margin-top: 16px;">Bu kod 1 saat gecerlidir.</p>
    </div>
  `;

  const skipResend =
    envIsTrue('MAIL_FORCE_SMTP') ||
    (shouldSkipResendSandbox() && SMTP_USER && SMTP_PASS);

  if (process.env.RESEND_API_KEY && !skipResend) {
    const r = await sendMailViaResend({ to: email, subject, html, text });
    if (r.success) return r;
    console.warn('Resend password reset failed, trying SMTP:', r.error);
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
      from: `"WordBoost" <${SMTP_USER}>`,
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

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Kullan?c? ad?, email ve ?ifre gerekli" });
    }

    // Email format kontrol?
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Ge?ersiz email format?" });
    }

    let user = await User.findOne({ 
      $or: [
        { username }, 
        { email }
      ] 
    });

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashed = await bcrypt.hash(password, 10);

    if (user) {
      // Kullan?c? var ama do?rulanmam??sa kayd? g?ncelle ve mail dene.
      if (!user.isVerified) {
        user.username = username;
        user.email = email;
        user.password = hashed;
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = Date.now() + 3600000;
        await user.save();

        const mailResult = await sendVerificationEmail(email, username, verificationCode);
        if (mailResult.success) {
          return res.json({
            success: true,
            requireVerification: true,
            email: email,
            message: "verification_code_sent"
          });
        }

        console.error("Register re-send mail error:", mailResult.error);
        return res.status(503).json({
          success: false,
          error: "verification_mail_failed",
          detail: mailResult.error || "unknown"
        });
      }

      if (user.email === email) return res.status(400).json({ error: "Email zaten kullan?l?yor" });
      return res.status(400).json({ error: "Kullan?c? ad? zaten kullan?l?yor" });
    }

    user = await User.create({
      username,
      email,
      password: hashed,
      nickname: username,
      badges: [BADGES.NEWBIE.id],
      isVerified: false,
      verificationCode,
      verificationCodeExpires: Date.now() + 3600000 // 1 saat ge?erli
    });

    // Mail G?nderme
    const mailResult = await sendVerificationEmail(email, username, verificationCode);

    if (mailResult.success) {
      return res.json({
        success: true,
        requireVerification: true,
        email: email,
        message: "verification_code_sent"
      });
    }

    console.error("Register mail error:", mailResult.error);
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
    const user = await User.findOne({ email });

    if (!user) {
      // G?venlik: Kullan?c? yoksa bile "g?nderildi" de (User enumeration prevention)
      // Ama user experience i?in ?imdilik hata d?nelim
      return res.status(404).json({ error: "Bu email ile kay?tl? kullan?c? bulunamad?" });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = resetCode; // Reuse verification code field
    user.verificationCodeExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const mailResult = await sendPasswordResetEmail(email, resetCode);

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
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ error: "Kullan?c? bulunamad?" });
    
    if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: "Ge?ersiz veya s?resi dolmu? kod" });
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
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: "Kullan?c? bulunamad?" });
    if (user.isVerified) return res.status(400).json({ error: "Hesap zaten do?rulanm??" });

    if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: "Ge?ersiz veya s?resi dolmu? kod" });
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

    // Email veya kullan?c? ad? ile giri?
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    });

    if (!user) {
      return res.status(400).json({ error: "Kullan?c? bulunamad?" });
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
    const { studied, known, unknown } = req.body;

    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: "Kullan?c? bulunamad?" });

    // Stats g?ncelle
    if (studied) user.stats.studied += studied;
    if (known) user.stats.known += known;
    if (unknown) user.stats.unknown += unknown;

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
    // 5 saniye zaman a??m? ekleyelim
    const words = await Word.find().sort({ term: 1 }).maxTimeMS(5000); 
    console.log(`Fetched ${words.length} words.`);
    res.json(words);
  } catch (err) {
    console.error("WORD FETCH ERROR:", err); 
    res.status(500).json({ error: "Database error: " + err.message });
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
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
