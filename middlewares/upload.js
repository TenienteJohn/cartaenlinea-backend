// middlewares/upload.js
const multer = require('multer');

// Configuración básica de Multer (almacena en memoria para subir directamente a Cloudinary)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = upload;
