const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Mongo bağlantısı
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🍃 MongoDB connected"))
  .catch(err => console.error("Mongo error:", err));

  const WordSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaning: { type: String, required: true },
  hint: String,
  example: String
}, { timestamps: true });

const Word = mongoose.model("Word", WordSchema);

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
  isActive: { type: Boolean, default: true },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000),
    index: { expires: 0 }
  }
}, { timestamps: true });

const Room = mongoose.model("Room", RoomSchema);

console.log("ENV TEST:", process.env.MONGO_URI);


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
app.use(express.json());

// Veri yapıları
const rooms = new Map();        // roomCode -> room bilgileri
const roomUsers = new Map();    // socket.id -> { roomCode, username, isHost }
const roomStats = new Map();    // roomCode -> { username: { studied, known, unknown, avatar } }
const roomHosts = new Map();    // roomCode -> hostUsername (güvenlik için)

function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// API Routes
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

app.get('/api/words', async (req, res) => {
  try {
    const words = await Word.find();
    res.json(words);
  } catch (err) {
    res.status(500).json({ error: "Database error" });
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
        avatar: userAvatar,
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
        avatar: userAvatar
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
  avatar: userAvatar,
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
        avatar: userAvatar
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
          avatar: userAvatar
        });
      }
      
      // Diğer kullanıcılara bildir
      socket.to(roomCode).emit('user-joined', { 
        username, 
        socketId: socket.id,
        isHost,
        avatar: userAvatar,
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

        roomHosts.set(roomCode, newHost);

        console.log(`🗑️ Room ${roomCode} is now empty, cleaned up`);

      } else {

        const hostName = roomHosts.get(roomCode);

        if (hostName === username) {
          const remainingUsers = Array.from(roomUsers.values())
            .filter(u => u.roomCode === roomCode)
            .sort((a, b) => a.joinedAt - b.joinedAt);

          if (remainingUsers.length > 0) {
            const newHost = remainingUsers[0].username;
            roomHosts.set(roomCode, newHost);
            roomHosts.set(roomCode, username);

const initialStats = {
  [username]: {
    studied: 0,
    known: 0,
    unknown: 0,
    avatar: userAvatar
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
 
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Client path: ${clientPath}`);
});
