const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
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
 * 🔹 POST /api/commerces
 * ✅ Crea un comercio con un OWNER asignado y un subdominio único.
 */
router.post("/", authMiddleware, async (req, res) => {
  const { business_name, subdomain, owner_email, owner_password, first_name, last_name, dni, address, phone } = req.body;

  if (!business_name || !subdomain || !owner_email || !owner_password) {
    return res.status(400).json({ error: "Faltan datos obligatorios para crear el comercio." });
  }

  try {
    // 🔹 Verificar si el subdominio ya existe
    const existingSubdomain = await pool.query("SELECT id FROM commerces WHERE subdomain = $1", [subdomain]);
    if (existingSubdomain.rows.length > 0) {
      return res.status(400).json({ error: "El subdominio ya está en uso. Elige otro." });
    }

    // 🔹 Insertar el comercio en la base de datos
    const commerceQuery = `
      INSERT INTO commerces (business_name, subdomain, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW()) RETURNING id
    `;
    const commerceValues = [business_name, subdomain];
    const commerceResult = await pool.query(commerceQuery, commerceValues);
    const commerceId = commerceResult.rows[0].id;

    // 🔹 Cifrar la contraseña del OWNER
    const hashedPassword = await bcrypt.hash(owner_password, 10);

    // 🔹 Insertar el usuario OWNER asociado al comercio
    const userQuery = `
      INSERT INTO users (email, password, role, commerce_id, first_name, last_name, dni, address, phone, created_at)
      VALUES ($1, $2, 'OWNER', $3, $4, $5, $6, $7, $8, NOW()) RETURNING id
    `;
    const userValues = [owner_email, hashedPassword, commerceId, first_name, last_name, dni, address, phone];
    await pool.query(userQuery, userValues);

    res.json({ message: "Comercio y usuario OWNER creados correctamente." });
  } catch (error) {
    console.error("❌ Error creando comercio:", error);
    res.status(500).json({ error: "Error en el servidor al crear el comercio." });
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
    await pool.query("DELETE FROM users WHERE commerce_id = $1", [id]);

    // 🔹 Si hay imagen en Cloudinary, eliminarla
    if (logoUrl) {
      const publicId = logoUrl.split("/").pop().split(".")[0];
      await cloudinary.uploader.destroy(`commerces-logos/${publicId}`);
    }

    // 🔹 Eliminar el comercio de la base de datos
    await pool.query("DELETE FROM commerces WHERE id = $1", [id]);

    res.json({ message: "Comercio eliminado correctamente." });

  } catch (error) {
    console.error("❌ Error al eliminar comercio:", error);
    res.status(500).json({ error: "Error en el servidor al eliminar comercio" });
  }
});

module.exports = router;
