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








