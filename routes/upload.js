const cloudinary = require('cloudinary').v2;
const axios = require('axios');
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

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * PUT /api/commerces/:id/update-logo
 * Descarga la imagen de la URL, la sube a Cloudinary y guarda la URL en PostgreSQL.
 */
router.put('/:id/update-logo', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { logoUrl } = req.body;

  if (!logoUrl) {
    return res.status(400).json({ error: 'Falta la URL de la imagen' });
  }

  try {
    console.log(`📌 Descargando imagen desde: ${logoUrl}`);

    // Descargar la imagen desde la URL
    const response = await axios({
      url: logoUrl,
      responseType: 'stream',
    });

    // Subir la imagen descargada a Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'commerces-logos' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      response.data.pipe(uploadStream);
    });

    console.log(`✅ Imagen subida a Cloudinary: ${uploadResult.secure_url}`);

    // Guardar la URL de Cloudinary en la base de datos
    const query = `UPDATE commerces SET logo_url = $1 WHERE id = $2 RETURNING *`;
    const values = [uploadResult.secure_url, id];
    const dbResult = await pool.query(query, values);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    res.json({ message: 'Logo actualizado correctamente', commerce: dbResult.rows[0] });

  } catch (error) {
    console.error('❌ Error en la actualización del logo:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;



