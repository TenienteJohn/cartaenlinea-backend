const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Pool } = require('pg');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');

// Configurar Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configurar Multer para almacenamiento temporal en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * PUT /api/commerces/:id/update-logo
 * Sube una imagen a Cloudinary y guarda la URL en PostgreSQL.
 */
router.put('/:id/update-logo', authMiddleware, upload.single('image'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  }

  try {
    // Subir la imagen a Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'commerces-logos', use_filename: true, unique_filename: false },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    // Guardar la URL en PostgreSQL
    const query = `UPDATE commerces SET logo_url = $1 WHERE id = $2 RETURNING *`;
    const values = [uploadResult.secure_url, id];
    const dbResult = await pool.query(query, values);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    res.json({ message: 'Logo actualizado correctamente', commerce: dbResult.rows[0] });

  } catch (error) {
    console.error('Error en la actualización del logo:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;

