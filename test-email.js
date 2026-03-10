
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'wordboost.team@gmail.com',
    pass: 'dtnc rugo nzan owfo'
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true,
  logger: true
});

async function main() {
  try {
    const info = await transporter.sendMail({
      from: '"WordBoost Test" <wordboost.team@gmail.com>',
      to: 'wordboost.team@gmail.com', // Send to self to test
      subject: 'Test Email',
      text: 'If you receive this, email sending is working.',
      html: '<b>If you receive this, email sending is working.</b>'
    });

    console.log("Message sent: %s", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

main();
