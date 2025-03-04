const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middlewares/authMiddleware");

// 🔹 Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * 🔹 POST /api/commerces
 * ✅ Crea un nuevo comercio con un usuario owner asociado
 */
router.post("/", authMiddleware, async (req, res) => {
  const { business_name, subdomain, address, phone, owner_name, category, email, password } = req.body;

  // 🔹 Validar que los campos obligatorios están presentes
  if (!business_name || !subdomain || !email || !password) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }

  try {
    // 🔹 Verificar si el subdominio ya existe
    const subdomainCheck = await pool.query("SELECT id FROM commerces WHERE subdomain = $1", [subdomain]);
    if (subdomainCheck.rows.length > 0) {
      return res.status(400).json({ error: "El subdominio ya está en uso" });
    }

    // 🔹 Iniciar una transacción para asegurar que todo se registre correctamente
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 🔹 Insertar el comercio en la base de datos
      const commerceQuery = `
        INSERT INTO commerces (business_name, subdomain, address, phone, owner_name, category, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *;
      `;
      const commerceValues = [business_name, subdomain, address, phone, owner_name, category];
      const commerceResult = await client.query(commerceQuery, commerceValues);
      const commerce = commerceResult.rows[0];

      // 🔹 Encriptar la contraseña del owner antes de guardarla
      const hashedPassword = await bcrypt.hash(password, 10);

      // 🔹 Insertar el usuario owner en la base de datos
      const userQuery = `
        INSERT INTO users (email, password, role, commerce_id, created_at, updated_at)
        VALUES ($1, $2, 'OWNER', $3, NOW(), NOW())
        RETURNING id, email, role, commerce_id;
      `;
      const userValues = [email, hashedPassword, commerce.id];
      const userResult = await client.query(userQuery, userValues);

      // 🔹 Confirmar la transacción
      await client.query("COMMIT");

      console.log("✅ Comercio y usuario owner creados correctamente");

      // 🔹 Responder con los datos del comercio y del owner creado
      res.json({
        message: "Comercio y usuario owner creados correctamente",
        commerce,
        owner: userResult.rows[0],
      });
    } catch (error) {
      // 🔹 Si hay un error, revertimos la transacción
      await client.query("ROLLBACK");
      console.error("❌ Error en la creación del comercio:", error);
      res.status(500).json({ error: "Error en el servidor al crear comercio" });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("❌ Error en la validación del subdominio:", error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
