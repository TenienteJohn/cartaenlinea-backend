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
 * ✅ Obtiene la lista de comercios
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    console.log("📌 Solicitando lista de comercios...");

    const result = await pool.query(`
      SELECT id, business_name, subdomain, address, phone, owner_name, category, logo_url, created_at, updated_at
      FROM commerces
      ORDER BY created_at DESC;
    `);

    if (result.rows.length === 0) {
      console.warn("⚠️ No se encontraron comercios.");
      return res.json({ message: "No hay comercios registrados", commerces: [] });
    }

    console.log("✅ Comercios obtenidos correctamente.");
    res.json({ commerces: result.rows });
  } catch (error) {
    console.error("❌ Error obteniendo comercios:", error);
    res.status(500).json({ error: "Error al obtener comercios" });
  }
});

/**
 * 🔹 DELETE /api/commerces/:id
 * ✅ Elimina un comercio y su logo en Cloudinary, eliminando primero los usuarios asociados.
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // 🔹 Buscar el comercio antes de eliminarlo
    const commerceQuery = await pool.query("SELECT logo_url FROM commerces WHERE id = $1", [id]);

    if (commerceQuery.rows.length === 0) {
      return res.status(404).json({ error: "El comercio no existe o ya fue eliminado." });
    }

    const logoUrl = commerceQuery.rows[0].logo_url;

    // 🔹 Eliminar los usuarios asociados al comercio
    console.log("📌 Eliminando usuarios asociados...");
    await pool.query("DELETE FROM users WHERE commerce_id = $1", [id]);
    console.log("✅ Usuarios eliminados.");

    // 🔹 Si hay imagen en Cloudinary, eliminarla
    if (logoUrl) {
      try {
        const publicId = logoUrl.split("/").pop().split(".")[0]; // Extraer ID de la imagen
        console.log("📌 Eliminando logo en Cloudinary:", publicId);
        await cloudinary.uploader.destroy(`commerces-logos/${publicId}`);
        console.log("✅ Logo eliminado en Cloudinary.");
      } catch (cloudinaryError) {
        console.error("❌ Error eliminando el logo en Cloudinary:", cloudinaryError);
      }
    }

    // 🔹 Eliminar el comercio de la base de datos
    const deleteQuery = await pool.query("DELETE FROM commerces WHERE id = $1 RETURNING *", [id]);

    if (deleteQuery.rowCount === 0) {
      return res.status(404).json({ error: "No se pudo eliminar el comercio" });
    }

    console.log("✅ Comercio eliminado correctamente.");
    res.json({ message: "Comercio eliminado correctamente." });

  } catch (error) {
    console.error("❌ Error al eliminar comercio:", error);
    res.status(500).json({ error: "Error en el servidor al eliminar comercio" });
  }
});

/**
 * 🔹 PUT /api/commerces/:id/update-logo
 * ✅ Sube una imagen a Cloudinary y actualiza el logo del comercio.
 */
router.put("/:id/update-logo", authMiddleware, upload.single("image"), async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "No se recibió ninguna imagen" });
  }

  try {
    console.log("📌 Subiendo imagen a Cloudinary...");

    // 🔹 Generar un nombre único basado en el ID del comercio y la fecha
    const timestamp = Date.now();
    const publicId = `commerces-logos/comercio_${id}_${timestamp}`;

    // 🔹 Subir la imagen a Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "commerces-logos",
          public_id: publicId,
          use_filename: false,
          unique_filename: false,
          overwrite: true,
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
