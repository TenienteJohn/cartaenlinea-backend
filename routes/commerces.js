const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const authMiddleware = require("../middlewares/authMiddleware");
const path = require("path");

// 🔹 Configurar Cloudinary con variables de entorno
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 🔹 Configurar almacenamiento en memoria con Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limitar a 5MB
  },
  fileFilter: (req, file, cb) => {
    // Validar que sea una imagen
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error("Solo se permiten archivos de imagen"));
  }
});

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
  const {
    business_name,
    subdomain,
    owner_email,
    owner_password,
    first_name = null,
    last_name = null,
    dni = null,
    address = null,
    phone = null,
    business_category = null
  } = req.body;

  if (!business_name || !subdomain || !owner_email || !owner_password) {
    return res.status(400).json({ error: "Faltan datos obligatorios para crear el comercio." });
  }

  try {
    // 🔹 Verificar si el subdominio ya existe
    const existingSubdomain = await pool.query("SELECT id FROM commerces WHERE subdomain = $1", [subdomain]);
    if (existingSubdomain.rows.length > 0) {
      return res.status(400).json({ error: "El subdominio ya está en uso. Elige otro." });
    }

    // 🔹 Insertar el comercio en la base de datos, incluyendo `business_category`
    const commerceQuery = `
      INSERT INTO commerces (business_name, subdomain, business_category, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id
    `;
    const commerceValues = [business_name, subdomain, business_category];
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
 * 🔹 PUT /api/commerces/:id
 * ✅ Actualiza los datos de un comercio existente.
 */
router.put("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { business_name, subdomain, business_category } = req.body;

  try {
    // Verificar si el comercio existe
    const commerceExists = await pool.query("SELECT id FROM commerces WHERE id = $1", [id]);

    if (commerceExists.rows.length === 0) {
      return res.status(404).json({ error: "El comercio no existe" });
    }

    // Verificar si el nuevo subdominio ya está en uso (si es diferente al actual)
    if (subdomain) {
      const existingSubdomain = await pool.query(
        "SELECT id FROM commerces WHERE subdomain = $1 AND id != $2",
        [subdomain, id]
      );

      if (existingSubdomain.rows.length > 0) {
        return res.status(400).json({ error: "El subdominio ya está en uso. Elige otro." });
      }
    }

    // Actualizar el comercio
    const updateQuery = `
      UPDATE commerces
      SET
        business_name = COALESCE($1, business_name),
        subdomain = COALESCE($2, subdomain),
        business_category = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const values = [
      business_name,
      subdomain,
      business_category,
      id
    ];

    const result = await pool.query(updateQuery, values);

    res.json({
      message: "Comercio actualizado correctamente",
      commerce: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Error actualizando comercio:", error);
    res.status(500).json({ error: "Error en el servidor al actualizar el comercio" });
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
      try {
        // Extraer el public_id correcto de Cloudinary
        const urlParts = logoUrl.split('/');
        // Encontrar el índice de 'upload' en la URL
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
          // El public_id comienza después de 'upload/v{number}/'
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));

          console.log("⚙️ Eliminando imagen con public_id:", publicId);
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (cloudinaryError) {
        console.error("⚠️ Error al eliminar imagen de Cloudinary:", cloudinaryError);
        // Continuar con la eliminación del comercio aunque falle la eliminación de la imagen
      }
    }

    // 🔹 Eliminar el comercio de la base de datos
    await pool.query("DELETE FROM commerces WHERE id = $1", [id]);

    res.json({ message: "Comercio eliminado correctamente." });

  } catch (error) {
    console.error("❌ Error al eliminar comercio:", error);
    res.status(500).json({ error: "Error en el servidor al eliminar comercio" });
  }
});

/**
 * 🔹 PUT /api/commerces/:id/update-logo
 * ✅ Actualiza el logo de un comercio usando Cloudinary.
 */
router.put("/:id/update-logo", authMiddleware, upload.single('logo'), async (req, res) => {
  const { id } = req.params;

  try {
    // Verificar si el comercio existe
    const commerceQuery = await pool.query("SELECT logo_url FROM commerces WHERE id = $1", [id]);

    if (commerceQuery.rows.length === 0) {
      return res.status(404).json({ error: "El comercio no existe" });
    }

    // Verificar si se ha subido un archivo
    if (!req.file) {
      return res.status(400).json({ error: "No se ha proporcionado un archivo" });
    }

    // Obtener información del comercio para el nombre del archivo
    const commerceInfo = await pool.query("SELECT business_name FROM commerces WHERE id = $1", [id]);
    const businessName = commerceInfo.rows[0]?.business_name || `comercio_${id}`;

    // Obtener el logo actual (si existe) para eliminarlo después
    const oldLogoUrl = commerceQuery.rows[0].logo_url;
    let oldPublicId = null;

    // Eliminar el logo anterior de Cloudinary si existe
    if (oldLogoUrl) {
      try {
        // Extraer el public_id correcto de Cloudinary
        const urlParts = oldLogoUrl.split('/');
        // Encontrar el índice de 'upload' en la URL
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
          // El public_id comienza después de 'upload/v{number}/'
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));

          console.log("⚙️ Eliminando imagen anterior con public_id:", publicId);
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (cloudinaryError) {
        console.error("⚠️ Error al eliminar imagen anterior de Cloudinary:", cloudinaryError);
        // Continuar con la subida de la nueva imagen aunque falle la eliminación de la anterior
      }
    }

    // Preparar el archivo para subir a Cloudinary
    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;

    // Sanitizar el nombre del archivo: reemplazar espacios y caracteres especiales
    const originalFilename = path.parse(req.file.originalname).name;
    const sanitizedFilename = originalFilename
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_');

    // Crear un nombre único para el archivo manteniendo el nombre original pero sanitizado
    const uniqueFilename = `${sanitizedFilename}_${Date.now()}`;

    // Convertir el buffer a base64 para enviarlo a Cloudinary
    const base64File = `data:${fileType};base64,${fileBuffer.toString('base64')}`;

    console.log("⚙️ Subiendo imagen a Cloudinary con filename:", uniqueFilename);

    // Subir a Cloudinary especificando la carpeta como una string, no anidada
    const uploadResult = await cloudinary.uploader.upload(base64File, {
      folder: 'commerces-logos', // Solo una carpeta, no anidada
      public_id: uniqueFilename,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { width: 500, height: 500, crop: 'limit' } // Limitar tamaño manteniendo proporción
      ]
    });

    console.log("✅ Imagen subida a Cloudinary:", uploadResult.secure_url);

    // Actualizar la URL del logo en la base de datos
    await pool.query(
      "UPDATE commerces SET logo_url = $1, updated_at = NOW() WHERE id = $2",
      [uploadResult.secure_url, id]
    );

    res.json({
      message: "Logo actualizado correctamente",
      logo_url: uploadResult.secure_url
    });

  } catch (error) {
    console.error("❌ Error al actualizar el logo:", error);
    res.status(500).json({
      error: "Error en el servidor al actualizar el logo",
      details: error.message
    });
  }
});

module.exports = router;

