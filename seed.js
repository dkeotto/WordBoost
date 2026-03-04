require('dotenv').config();
const mongoose = require('mongoose');
const words = require('./words');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo connected"))
  .catch(err => console.error(err));

const WordSchema = new mongoose.Schema({
  term: { type: String, required: true },
  meaning: { type: String, required: true },
  hint: String,
  example: String
}, { timestamps: true });

const Word = mongoose.model("Word", WordSchema);

async function seed() {
  try {
    console.log("Eski kelimeler siliniyor...");
    await Word.deleteMany({});

    console.log("Yeni kelimeler ekleniyor...");
    await Word.insertMany(words);

    console.log(`🔥 ${words.length} kelime Mongo'ya eklendi!`);
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();