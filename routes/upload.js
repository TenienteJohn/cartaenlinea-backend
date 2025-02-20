// routes/upload.js
const express = require('express');
const router = express.Router();
const cloudinary = require('../config/cloudinaryConfig'); // Ajusta la ruta según tu estructura
const upload = require('../middlewares/upload');   // Middleware de Multer

/**
 * Endpoint POST para subir una imagen a Cloudinary.
 * Se espera recibir el archivo en el campo "image".
 */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    // req.file contiene la imagen subida en memoria
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    // Subir la imagen a Cloudinary (opcional: puedes especificar un folder)
    const result = await cloudinary.uploader.upload_stream({ folder: 'cartaenlinea' }, (error, result) => {
      if (error) {
        console.error('Error al subir a Cloudinary:', error);
        return res.status(500).json({ error: 'Error al subir la imagen' });
      }
      // Responder con la URL segura de la imagen
      return res.status(201).json({ imageUrl: result.secure_url });
    });

    // Escribir el buffer en el stream
    req.file.stream = require('stream').Readable.from(req.file.buffer);
    req.file.stream.pipe(result);
  } catch (error) {
    console.error('Error en el endpoint /api/upload:', error);
    res.status(500).json({ error: 'Error en el servidor al subir la imagen' });
  }
});

module.exports = router;
