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

// 🔹 Configurar almacenamiento en memoria con Multer
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
 * 🔹 DELETE /api/commerces/:id
 * ✅ Elimina un comercio de la base de datos y borra su logo de Cloudinary (si existe).
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // 🔹 Buscar el comercio antes de eliminarlo para verificar si tiene logo
    const findQuery = `SELECT logo_url FROM commerces WHERE id = $1`;
    const findResult = await pool.query(findQuery, [id]);

    if (findResult.rows.length === 0) {
      return res.status(404).json({ error: "El comercio no existe o ya fue eliminado." });
    }

    const logoUrl = findResult.rows[0].logo_url;

    // 🔹 Eliminar el comercio de la base de datos
    const deleteQuery = `DELETE FROM commerces WHERE id = $1 RETURNING *`;
    const deleteResult = await pool.query(deleteQuery, [id]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: "El comercio no pudo ser eliminado." });
    }

    console.log("✅ Comercio eliminado de la base de datos:", deleteResult.rows[0]);

    // 🔹 Si el comercio tenía un logo en Cloudinary, eliminarlo
    if (logoUrl) {
      try {
        const publicId = logoUrl.split("/").pop().split(".")[0]; // Extraer el ID de la imagen de la URL
        await cloudinary.uploader.destroy(`commerces-logos/${publicId}`);
        console.log("✅ Logo eliminado de Cloudinary:", logoUrl);
      } catch (cloudinaryError) {
        console.error("❌ Error eliminando el logo en Cloudinary:", cloudinaryError);
      }
    }

    res.json({ message: "Comercio eliminado correctamente" });
  } catch (error) {
    console.error("❌ Error al eliminar comercio:", error);
    res.status(500).json({ error: "Error en el servidor al eliminar comercio" });
  }
});

/**
 * 🔹 PUT /api/commerces/:id/update-logo
 * ✅ Sube una imagen a Cloudinary y actualiza el logo del comercio
 */
router.put("/:id/update-logo", authMiddleware, upload.single("image"), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen" });
  }

  try {
    console.log("📌 Subiendo imagen a Cloudinary...");

    // 🔹 Generar un nombre único basado en el ID del comercio y la fecha
    const timestamp = Date.now(); // Marca de tiempo actual
    const publicId = `commerces-logos/comercio_${id}_${timestamp}`; // Nombre único en Cloudinary

    // 🔹 Subir la imagen a Cloudinary con `public_id` para personalizar el nombre
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "commerces-logos",
          public_id: publicId, // Nombre personalizado
          use_filename: false,
          unique_filename: false, // Asegura que se sobrescriba si ya existe
          overwrite: true, // Sobrescribe la imagen existente del comercio
          resource_type: "image",
        },
        (error, result) => {
          if (error) {
            console.error("❌ Error en Cloudinary:", error);
            reject(error);
          } else {
            console.log("✅ Imagen subida con éxito en Cloudinary:", result.secure_url);
            resolve(result);
          }
        }
      );

      uploadStream.end(req.file.buffer);
    });

    // 🔹 Verificar que Cloudinary devolvió la URL
    if (!uploadResult || !uploadResult.secure_url) {
      return res.status(500).json({ error: "Error subiendo imagen a Cloudinary" });
    }

    console.log("✅ Imagen subida correctamente:", uploadResult.secure_url);

    // 🔹 Guardar la URL en la base de datos
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




