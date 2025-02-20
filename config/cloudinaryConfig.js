// cloudinaryConfig.js
const cloudinary = require('cloudinary').v2;

// Configurar Cloudinary usando las variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,   // Ej: "tu_cloud_name"
  api_key: process.env.CLOUDINARY_API_KEY,         // Ej: "tu_api_key"
  api_secret: process.env.CLOUDINARY_API_SECRET      // Ej: "tu_api_secret"
});

module.exports = cloudinary;