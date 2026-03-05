require('dotenv').config();
const mongoose = require('mongoose');
const words = require('./words');

    
const WordSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaning: { type: String, required: true },
  hint: String,
  example: String,
  level: {
    type: String,
    enum: ["A1","A2","B1","B2","C1","C2"]
  }
}, { timestamps: true });

console.log("Connected to:", process.env.MONGO_URI);


const Word = mongoose.model("Word", WordSchema);

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Mongo connected");

    console.log("Eski kelimeler siliniyor...");
    await Word.deleteMany({});

    console.log("Yeni kelimeler ekleniyor...");
    await Word.insertMany(words);

    console.log(`🔥 ${words.length} kelime Mongo'ya eklendi!`);

    mongoose.disconnect();
  } catch (err) {
    console.error(err);

  }
}

seed();