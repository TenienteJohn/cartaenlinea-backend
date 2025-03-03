const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { Pool } = require('pg');
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware'); // Middleware de autenticación

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configuración de almacenamiento en memoria con Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * PUT /api/commerces/:id/update-logo
 * Permite actualizar la URL del logo de un comercio en PostgreSQL.
 */
router.put('/:id/update-logo', authMiddleware, upload.single('image'), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: 'No se recibió ninguna imagen' });
  }

  try {
    // Subir la imagen a Cloudinary
    const uploadResult = await cloudinary.uploader.upload_stream(
      { folder: 'commerces-logos' },
      async (error, result) => {
        if (error) {
          console.error('Error subiendo imagen a Cloudinary:', error);
          return res.status(500).json({ error: 'Error al subir imagen' });
        }

        // Guardar la URL en PostgreSQL
        const query = `UPDATE commerces SET logo_url = $1 WHERE id = $2 RETURNING *`;
        const values = [result.secure_url, id];
        const dbResult = await pool.query(query, values);

        if (dbResult.rows.length === 0) {
          return res.status(404).json({ error: 'Comercio no encontrado' });
        }

        res.json({ message: 'Logo actualizado correctamente', commerce: dbResult.rows[0] });
      }
    );

    uploadResult.end(req.file.buffer);
  } catch (error) {
    console.error('Error en la actualización del logo:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;
