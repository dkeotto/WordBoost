require('dotenv').config();
const nodemailer = require('nodemailer');

const user = process.env.EMAIL_USER || 'wordboost.team@gmail.com';
const pass = process.env.EMAIL_PASS || 'dtnc rugo nzan owfo';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user, pass },
  tls: { rejectUnauthorized: false },
  debug: true,
  logger: true
});

async function main() {
  console.log('📧 Mail gönderme testi başlıyor...');
  try {
    const info = await transporter.sendMail({
      from: `"WordBoost Test" <${user}>`,
      to: user,
      subject: 'WordBoost Mail Testi',
      text: 'Bu maili aldıysan mail gönderimi çalışıyor.',
      html: '<p><b>Bu maili aldıysan mail gönderimi çalışıyor.</b></p>'
    });
    console.log('✅ Başarılı. Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Hata:', error.message);
    process.exit(1);
  }
}

main();
