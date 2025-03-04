const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");

// 🔹 Configurar Cloudinary con variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🔹 Configurar almacenamiento de imágenes en memoria con Multer
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 🔹 Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * 🔹 GET /api/commerces
 * Obtiene la lista de comercios
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM commerces");
    res.json(result.rows);
  } catch (error) {
    console.error("❌ Error obteniendo comercios:", error);
    res.status(500).json({ error: "Error al obtener comercios" });
  }
});

/**
 * 🔹 PUT /api/commerces/:id/update-logo
 * ✅ Sube una imagen a Cloudinary y actualiza el logo del comercio
 */
router.put("/:id/update-logo", authMiddleware, upload.single("image"), async (req, res) => {
  const { id } = req.params;

  // Validar que el ID sea un número
  if (isNaN(id)) {
    return res.status(400).json({ error: "ID de comercio inválido" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen" });
  }

  try {
    console.log("📌 Subiendo imagen a Cloudinary...");

    // 🔹 Subir la imagen a Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "commerces-logos",
          use_filename: true,
          unique_filename: false,
          timestamp: Math.round(new Date().getTime() / 1000), // 🔹 Asegura la firma correcta
        },
        (error, result) => {
          if (error) {
            console.error("❌ Error en Cloudinary:", error);
            reject(error);
          } else {
            console.log("✅ Imagen subida con éxito:", result.secure_url);
            resolve(result);
          }
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Verificar que la imagen se subió correctamente
    if (!uploadResult || !uploadResult.secure_url) {
      return res.status(500).json({ error: "Error subiendo imagen a Cloudinary" });
    }

    console.log("✅ Imagen subida correctamente:", uploadResult.secure_url);

    // 🔹 Guardar la URL en PostgreSQL
    const query = `UPDATE commerces SET logo_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const values = [uploadResult.secure_url, id];
    const dbResult = await pool.query(query, values);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: "Comercio no encontrado" });
    }

    console.log("✅ Logo actualizado en la base de datos:", dbResult.rows[0]);

    res.json({ message: "Logo actualizado correctamente", commerce: dbResult.rows[0] });
  } catch (error) {
    console.error("❌ Error en la actualización del logo:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;



