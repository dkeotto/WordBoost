const path = require('path');
const fs = require('fs');

const clientPath = path.join(__dirname, 'ydt-kelime-pratigi', 'dist');
console.log('__dirname:', __dirname);
console.log('clientPath:', clientPath);
console.log('Exists:', fs.existsSync(clientPath));
if (fs.existsSync(clientPath)) {
  console.log('Contents:', fs.readdirSync(clientPath));
}
