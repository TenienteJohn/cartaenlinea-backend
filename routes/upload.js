const express = require("express");
const router = express.Router();
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { Pool } = require("pg");
const authMiddleware = require("../middlewares/authMiddleware"); // Middleware de autenticación

// 🔹 Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 🔹 Configuración de Multer para almacenar archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 🔹 Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * 📌 PUT /api/commerces/:id/update-logo
 * Permite actualizar la URL del logo de un comercio en PostgreSQL.
 */
router.put(
  "/:id/update-logo",
  authMiddleware,
  upload.single("image"), // 🖼️ Middleware para manejar el archivo
  async (req, res) => {
    const { id } = req.params;

    // 🔎 Validamos si la imagen fue enviada
    if (!req.file) {
      return res.status(400).json({ error: "No se recibió ninguna imagen" });
    }

    try {
      // 📤 Subimos la imagen a Cloudinary usando Promesas
      const uploadImage = () => {
        return new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "commerces-logos" },
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );
          stream.end(req.file.buffer); // 🖼️ Subimos el buffer de la imagen
        });
      };

      const uploadResult = await uploadImage(); // 📤 Esperamos que la imagen se suba
      console.log("✅ Imagen subida correctamente:", uploadResult.secure_url);

      // 🔄 Actualizamos la base de datos con la nueva URL del logo
      const query = `UPDATE commerces SET logo_url = $1 WHERE id = $2 RETURNING *`;
      const values = [uploadResult.secure_url, id];
      const dbResult = await pool.query(query, values);

      if (dbResult.rows.length === 0) {
        return res.status(404).json({ error: "Comercio no encontrado" });
      }

      res.json({
        message: "Logo actualizado correctamente",
        commerce: dbResult.rows[0],
      });

    } catch (error) {
      console.error("❌ Error en la actualización del logo:", error);
      res.status(500).json({ error: "Error en el servidor" });
    }
  }
);

module.exports = router;

