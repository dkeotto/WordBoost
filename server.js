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
app.set('trust proxy', 1); // Proxy arkasında (Render/Railway) çalıştığı için gerekli
const server = http.createServer(app);

// Session Config (Passport için gerekli)
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
  isVerified: { type: Boolean, default: false }, // Mail doğrulama durumu
  verificationCode: String, // Doğrulama kodu
  verificationCodeExpires: Date, // Kod geçerlilik süresi
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
let FRONTEND_URL = process.env.FRONTEND_URL;
let BACKEND_URL = process.env.BACKEND_URL;

// Auto-detect Railway
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  const railwayUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if (!BACKEND_URL) BACKEND_URL = railwayUrl;
  if (!FRONTEND_URL) FRONTEND_URL = railwayUrl;
  console.log("🚂 Railway Environment Detected");
}

// Auto-detect Render
if (process.env.RENDER_EXTERNAL_URL) {
  if (!BACKEND_URL) BACKEND_URL = process.env.RENDER_EXTERNAL_URL;
  if (!FRONTEND_URL) FRONTEND_URL = process.env.RENDER_EXTERNAL_URL;
  console.log("☁️ Render Environment Detected");
}

// Defaults
if (!BACKEND_URL) BACKEND_URL = 'http://localhost:3000';
if (!FRONTEND_URL) FRONTEND_URL = 'http://localhost:5173';

console.log("🔹 Final Configuration:");
console.log(`   - FRONTEND: ${FRONTEND_URL}`);
console.log(`   - BACKEND: ${BACKEND_URL}`);

console.log("🔹 Google Callback URL:", `${BACKEND_URL}/auth/google/callback`);

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || "GOOGLE_CLIENT_ID_BURAYA",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "GOOGLE_CLIENT_SECRET_BURAYA",
    callbackURL: `${BACKEND_URL}/auth/google/callback`,
    passReqToCallback: true,
    proxy: true // Railway/Render için gerekli
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      console.log("🔹 Google Profile:", profile.displayName, profile.id);
      
      // 1. Önce Google ID ile ara
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // 2. Email ile ara (Hesap eşleştirme)
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (email) {
        user = await User.findOne({ email });
        if (user) {
          // Mevcut hesaba Google ID ekle
          user.googleId = profile.id;
          // Eğer avatar yoksa Google avatarını ekle
          if (!user.avatar || user.avatar === '👤') {
             user.avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : user.avatar;
          }
          await user.save();
          return done(null, user);
        }
      }

      // 3. Yeni Kullanıcı Oluştur
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
        isVerified: true, // Google ile gelenler otomatik onaylı
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
  passport.authenticate('google', (err, user, info) => {
    if (err) {
      console.error("Google Auth Error:", err);
      // Hata durumunda frontend'e yönlendir
      return res.redirect(`${FRONTEND_URL}/?error=auth_error`);
    }
    if (!user) {
      // Kullanıcı iptal ettiyse veya kullanıcı bulunamadıysa
      return res.redirect(`${FRONTEND_URL}/?error=auth_cancel`);
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("Login Error:", loginErr);
        return res.redirect(`${FRONTEND_URL}/?error=login_error`);
      }

      // Başarılı giriş
      const token = jwt.sign(
        { id: user._id, username: user.username },
        "SECRET_KEY",
        { expiresIn: "30d" }
      );

      // FRONTEND_URL'e yönlendir (Token ile)
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

    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    await User.findByIdAndDelete(decoded.id);
    res.json({ success: true, message: "Hesap silindi" });

  } catch (err) {
    res.status(500).json({ error: "Delete error: " + err.message });
  }
});

// BADGE CONSTANTS
const BADGES = {
  NEWBIE: { id: 'newbie', icon: '🐣', name: 'Yeni Başlayan', desc: 'Aramıza hoş geldin!' },
  STREAK_3: { id: 'streak_3', icon: '🔥', name: '3 Günlük Seri', desc: '3 gün üst üste çalıştın!' },
  STREAK_7: { id: 'streak_7', icon: '⚡', name: 'Haftalık Seri', desc: '7 gün üst üste çalıştın!' },
  STREAK_30: { id: 'streak_30', icon: '🚀', name: 'Aylık Seri', desc: '30 gün üst üste çalıştın! İnanılmaz!' },
  KNOWN_100: { id: 'known_100', icon: '🧠', name: 'Kelime Avcısı', desc: '100 kelime öğrendin!' },
  KNOWN_500: { id: 'known_500', icon: '🎓', name: 'Kelime Ustası', desc: '500 kelime öğrendin!' },
  KNOWN_1000: { id: 'known_1000', icon: '👑', name: 'Kelime Kralı', desc: '1000 kelime öğrendin!' },
  NIGHT_OWL: { id: 'night_owl', icon: '🦉', name: 'Gece Kuşu', desc: 'Gece 00:00 - 05:00 arası çalıştın.' },
  EARLY_BIRD: { id: 'early_bird', icon: '🌅', name: 'Erkenci Kuş', desc: 'Sabah 05:00 - 09:00 arası çalıştın.' },
  WEEKEND_WARRIOR: { id: 'weekend_warrior', icon: '🎉', name: 'Hafta Sonu Savaşçısı', desc: 'Hafta sonu çalışmayı ihmal etmedin.' }
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
    console.log("🍃 MongoDB connected");

    // CLEANUP GHOST USERS & UNVERIFIED USERS
    try {
      const deleted = await User.deleteMany({
        $or: [
          { username: { $exists: false } },
          { username: null },
          { username: "" },
          { "username": { $type: "string", $regex: /^\s*$/ } }, // sadece boşluk içerenler
          { isVerified: false } // Doğrulanmamış hesapları sil
        ]
      });
      if (deleted.deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deleted.deletedCount} ghost/unverified users`);
      }
    } catch (e) {
      console.error("Cleanup error:", e);
    }

    const PORT = process.env.PORT || 3000;
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Mongo connection error:", err);
    process.exit(1);
  }
}

startServer();


// CORS ve transport ayarları
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

// Veri yapıları
const rooms = new Map();        // roomCode -> room bilgileri
const roomUsers = new Map();    // socket.id -> { roomCode, username, isHost }
const roomStats = new Map();    // roomCode -> { username: { studied, known, unknown, avatar } }
const roomHosts = new Map();    // roomCode -> hostUsername (güvenlik için)

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// NODEMAILER CONFIG
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'wordboost.team@gmail.com',
    pass: process.env.EMAIL_PASS || 'dtnc rugo nzan owfo'
  },
  debug: true, // Show debug output
  logger: true // Log information to console
});

// Helper to send mail
async function sendVerificationEmail(email, username, code) {
  try {
    const sender = process.env.EMAIL_USER || 'wordboost.team@gmail.com';
    const info = await transporter.sendMail({
      from: `"WordBoost" <${sender}>`, // Sender address must match auth user
      to: email,
      subject: 'WordBoost Doğrulama Kodu',
      text: `Merhaba ${username},\n\nHesabını doğrulamak için kodun: ${code}\n\nİyi çalışmalar!`,
      html: `<h3>Merhaba ${username},</h3><p>Hesabını doğrulamak için kodun:</p><h2>${code}</h2><p>İyi çalışmalar!</p>`
    });
    console.log("Message sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Mail sending failed:", error);
    return false;
  }
}

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email ve password gerekli" });
    }

    // Email format kontrolü
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Geçersiz email formatı" });
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
      // Eğer kullanıcı var ama doğrulanmamışsa, kaydı güncelle ve tekrar mail at
      if (!user.isVerified) {
        // HESAP KURTARMA / ÜZERİNE YAZMA (Unverified accounts only)
        // Eğer kullanıcı adı veya email eşleşiyorsa ve hesap doğrulanmamışsa,
        // yeni gelen kişi bu hesabı devralabilir (email ve şifresini güncelleyerek).
        
        user.username = username;
        user.email = email;
        user.password = hashed;
        user.verificationCode = verificationCode;
        user.verificationCodeExpires = Date.now() + 3600000;
        await user.save();
           
        // Mail Gönder
        sendVerificationEmail(email, username, verificationCode);

        return res.json({
          success: true,
          requireVerification: true,
          email: email,
          message: "Doğrulama kodu tekrar gönderildi"
        });
      }

      if (user.email === email) return res.status(400).json({ error: "Email zaten kullanılıyor" });
      return res.status(400).json({ error: "Username zaten kullanılıyor" });
    }

    user = await User.create({
      username,
      email,
      password: hashed,
      nickname: username,
      badges: [BADGES.NEWBIE.id],
      isVerified: false,
      verificationCode,
      verificationCodeExpires: Date.now() + 3600000 // 1 saat geçerli
    });

    // Mail Gönderme
    sendVerificationEmail(email, username, verificationCode);

    res.json({
      success: true,
      requireVerification: true,
      email: email,
      message: "Doğrulama kodu gönderildi"
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
      // Güvenlik: Kullanıcı yoksa bile "gönderildi" de (User enumeration prevention)
      // Ama user experience için şimdilik hata dönelim
      return res.status(404).json({ error: "Bu email ile kayıtlı kullanıcı bulunamadı" });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = resetCode; // Reuse verification code field
    user.verificationCodeExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    const sender = process.env.EMAIL_USER || 'wordboost.team@gmail.com';
    await transporter.sendMail({
      from: `"WordBoost" <${sender}>`,
      to: email,
      subject: 'Şifre Sıfırlama Kodu',
      text: `Şifreni sıfırlamak için kodun: ${resetCode}`,
      html: `<h3>Şifre Sıfırlama</h3><p>Kodun:</p><h2>${resetCode}</h2>`
    });

    res.json({ success: true, message: "Sıfırlama kodu gönderildi" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error sending email" });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    
    if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: "Geçersiz veya süresi dolmuş kod" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ success: true, message: "Şifre başarıyla güncellendi" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reset error" });
  }
});

app.post('/api/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ error: "Kullanıcı bulunamadı" });
    if (user.isVerified) return res.status(400).json({ error: "Hesap zaten doğrulanmış" });

    if (user.verificationCode !== code || user.verificationCodeExpires < Date.now()) {
      return res.status(400).json({ error: "Geçersiz veya süresi dolmuş kod" });
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

    // Email veya Username ile giriş
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    });

    if (!user) {
      return res.status(400).json({ error: "Kullanıcı bulunamadı" });
    }

    // Şifre kontrolü
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(400).json({ error: "Şifre yanlış" });
    }

    // Doğrulama kontrolü (Opsiyonel: Eğer zorunluysa burayı aç)
    /*
    if (!user.isVerified) {
      return res.json({ 
        success: false, 
        requireVerification: true, 
        email: user.email,
        error: "Lütfen önce mail adresinizi doğrulayın" 
      });
    }
    */

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
        avatar: user.avatar || "👤",
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
      avatar: user.avatar || "👤",
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
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    // Username değişimi ve unique kontrolü
    if (username && username !== user.username) {
      // Format kontrolü (boşluk olmamalı, min 3 karakter)
      if (username.length < 3 || /\s/.test(username)) {
        return res.status(400).json({ error: "Kullanıcı adı en az 3 karakter olmalı ve boşluk içermemelidir." });
      }

      const existing = await User.findOne({ username });
      if (existing) {
        return res.status(400).json({ error: "Bu kullanıcı adı zaten alınmış." });
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
    // STREAK'e göre sırala (Önce en yüksek seri, sonra en çok bilinen kelime)
    const users = await User.find({
      username: { $exists: true, $ne: "" },
      "stats.known": { $exists: true },
      isVerified: true // Sadece doğrulanmış kullanıcılar
    })
      .sort({ "streak": -1, "stats.known": -1 }) // Önce seri, sonra puan
      .limit(50)
      .select("username nickname avatar stats badges streak");

    // Boş kullanıcıları filtrele (ek güvenlik)
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
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    // Stats güncelle
    if (studied) user.stats.studied += studied;
    if (known) user.stats.known += known;
    if (unknown) user.stats.unknown += unknown;

    // Streak Logic
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
    if (lastStudy) lastStudy.setHours(0, 0, 0, 0);

    if (!lastStudy) {
      // İlk defa çalışıyor
      user.streak = 1;
      user.lastStudyDate = new Date();
    } else if (today.getTime() === lastStudy.getTime()) {
      // Bugün zaten çalışmış, streak değişmez
      user.lastStudyDate = new Date();
    } else if (today.getTime() === lastStudy.getTime() + 86400000) {
      // Dün çalışmış, streak artar
      user.streak += 1;
      user.lastStudyDate = new Date();
    } else {
      // Dünden önce çalışmış, streak sıfırlanır (veya 1 olur)
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
        avatar: avatar || "👤",
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
    res.status(500).json({ error: "Room oluşturulamadı" });
  }
});

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({ status: 'OK', db: dbStatus, timestamp: new Date() });
});

app.get('/api/words', async (req, res) => {
  try {
    console.log("Fetching words...");
    // 5 saniye zaman aşımı ekleyelim
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
// TÜM KELİMELERİ GETİR

// Yardımcı fonksiyon: Oda kullanıcılarını stats'tan oluştur
function getUsersFromStats(roomCode) {
  const stats = roomStats.get(roomCode) || {};
  const hostName = roomHosts.get(roomCode);
  
  return Object.entries(stats).map(([username, userStat]) => ({
    username: username,
    isHost: hostName === username,
    avatar: userStat.avatar || '👤',
    studied: userStat.studied || 0,
    known: userStat.known || 0
  }));
}

// Socket.IO
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
 
  // ODA OLUŞTURMA - Host burada belirlenir!
  socket.on('create-room', async ({ username, avatar }, callback) => {
  try {

    if (!username || username.trim().length < 2) {
      callback?.({ success: false, error: 'Geçerli kullanıcı adı girin' });
      return;
    }

    const roomCode = generateRoomCode();
    const userAvatar = avatar || '👤';

    console.log("Mongo'ya room yazılıyor...");

    const mongoRoom = await Room.create({
      code: roomCode,
      host: username,
      users: [{
        username,
        avatar: '👤',
        studied: 0,
        known: 0,
        unknown: 0
      }],
      isActive: true
    });

    console.log("Mongo room yazıldı:", mongoRoom.code);

    roomHosts.set(roomCode, username);

 const initialStats = {
      [username]: {
        studied: 0,
        known: 0,
        unknown: 0,
        avatar: '👤'
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
  avatar: '👤',
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
    console.log(`🚪 Join attempt: ${username} -> ${roomCode}`);

    if (!username || username.trim().length < 2) {
      if (callback) callback({ success: false, error: 'Geçerli kullanıcı adı girin' });
      return;
    }

    if (!roomCode || roomCode.length !== 6) {
      if (callback) callback({ success: false, error: 'Geçerli oda kodu girin (6 haneli)' });
      return;
    }

    const room = await Room.findOne({ code: roomCode });

    if (!room || !room.isActive) {
      console.log(`❌ Room not found: ${roomCode}`);
      if (callback) callback({ success: false, error: 'Oda bulunamadı veya kapalı' });
      return;
    }

      
      // Aynı kullanıcı adı kontrolü (odada aktif olanlar arasında)
      const currentRoomStats = roomStats.get(roomCode) || {};
      if (currentRoomStats[username]) {
        console.log(`❌ Username taken: ${username}`);
        if (callback) callback({ success: false, error: 'Bu kullanıcı adı odada kullanılıyor' });
        return;
      }
      
      // Socket odaya katıl
      socket.join(roomCode);
      
      // Host mu kontrol et (server tarafında güvenlik!)
      const isHost = roomHosts.get(roomCode) === username;
      
      // Kullanıcıyı kaydet
      roomUsers.set(socket.id, { 
        roomCode, 
        username, 
        isHost,
        joinedAt: new Date()
      });
      
      // Avatar ata
      const userAvatar = avatar || '👤';
      
      // Stats'a ekle
      if (!roomStats.has(roomCode)) {
        roomStats.set(roomCode, {});
      }
      const stats = roomStats.get(roomCode);
      stats[username] = { 
        studied: 0, 
        known: 0, 
        unknown: 0,
        avatar: '👤'
      };
      
      // Odadaki tüm kullanıcıları topla (güncel stats ile)
      const users = getUsersFromStats(roomCode);
      
      console.log(`✅ ${username} joined ${roomCode}. Total users: ${users.length}`);
      
      // CALLBACK ile yanıt ver
      if (callback) {
        callback({ 
          success: true,
          roomCode, 
          users,
          isHost,  // Server tarafında belirlenen değer!
          stats: stats,
          avatar: '👤'
        });
      }
      
      // Diğer kullanıcılara bildir
      socket.to(roomCode).emit('user-joined', { 
        username, 
        socketId: socket.id,
        isHost,
        avatar: '👤',
        studied: 0,
        known: 0
      });
      
      // Tüm odadakilere güncel stats gönder (users ile birlikte)
      io.to(roomCode).emit('sync-stats', { 
        stats,
        users: users
      });
      
    } catch (error) {
      console.error('❌ Error joining room:', error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // STATS GÜNCELLEME
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

  // KELİME DEĞİŞTİRME (sadece host)
  socket.on('change-word', ({ roomCode, wordIndex }) => {
    try {
      const user = roomUsers.get(socket.id);
      const hostName = roomHosts.get(roomCode);
      
      // Güvenlik kontrolü: Sadece gerçek host değiştirebilir
      if (user && user.roomCode === roomCode && user.username === hostName) {
        socket.to(roomCode).emit('sync-word', { wordIndex });
        console.log(`📖 Word changed to ${wordIndex} by host ${user.username}`);
      } else {
        console.log(`⚠️ Unauthorized word change attempt by ${user?.username}`);
      }
    } catch (error) {
      console.error('Error changing word:', error);
    }
  });

  // AYRILMA
  socket.on('leave-room', ({ roomCode, username }) => {
    handleUserLeave(socket, roomCode, username);
  });
  
  // BAĞLANTI KOPMA
  socket.on('disconnect', (reason) => {
    console.log('❌ User disconnected:', socket.id, 'Reason:', reason);
    const user = roomUsers.get(socket.id);
    if (user) {
      handleUserLeave(socket, user.roomCode, user.username);
    }
  });
  
  // AYRILMA İŞLEYİCİSİ
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

        console.log(`🗑️ Room ${roomCode} is now empty, cleaned up`);

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
    avatar: '👤'
  }
};
            console.log(`👑 New host assigned: ${newHost}`);
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
    console.log(`👋 ${username} left room ${roomCode}`);

  } catch (error) {
    console.error('Error leaving room:', error);
  }
}
});

// Static files (production için)
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