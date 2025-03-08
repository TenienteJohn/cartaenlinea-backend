// routes/products.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Endpoint para crear un producto
router.post('/', async (req, res) => {
  try {
    // Datos del body
    const { name, description, price, category_id } = req.body;

    // Validar datos requeridos
    if (!name || price === undefined || !category_id) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, precio o categoría)' });
    }

    // Obtener el ID del comercio del usuario autenticado
    const commerceId = req.user.commerceId;

    // Insertar el producto en la base de datos
    const query = `
      INSERT INTO products (name, description, price, category_id, commerce_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [name, description || '', price, category_id, commerceId];
    const result = await pool.query(query, values);

    // Devolver el producto creado
    res.status(201).json({
      message: 'Producto creado exitosamente',
      product: result.rows[0]
    });
  } catch (error) {
    console.error('Error en /api/products [POST]', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Endpoint para obtener todos los productos
router.get('/', async (req, res) => {
  try {
    // Obtener el ID del comercio del usuario autenticado
    const commerceId = req.user.commerceId;

    // Consulta SQL para obtener productos
    const query = `
      SELECT * FROM products
      WHERE commerce_id = $1
      ORDER BY name
    `;

    const result = await pool.query(query, [commerceId]);

    // Devolver el array de productos (puede estar vacío)
    res.json(result.rows);
  } catch (error) {
    console.error('Error en /api/products [GET]', error);
    // En caso de error, devolver un array vacío para evitar errores en el frontend
    res.json([]);
  }
});

// Endpoint para obtener un producto específico
router.get('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const commerceId = req.user.commerceId;

    // Consulta SQL para obtener el producto específico
    const query = `
      SELECT * FROM products
      WHERE id = $1 AND commerce_id = $2
    `;

    const result = await pool.query(query, [productId, commerceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error en /api/products/${req.params.id} [GET]`, error);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

// Endpoint para actualizar un producto
router.put('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, description, price, category_id } = req.body;
    const commerceId = req.user.commerceId;

    // Validar datos requeridos
    if (!name || price === undefined || !category_id) {
      return res.status(400).json({ error: 'Faltan campos requeridos (nombre, precio o categoría)' });
    }

    // Consulta SQL para actualizar el producto
    const query = `
      UPDATE products
      SET name = $1, description = $2, price = $3, category_id = $4, updated_at = NOW()
      WHERE id = $5 AND commerce_id = $6
      RETURNING *
    `;

    const values = [name, description || '', price, category_id, productId, commerceId];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos para editarlo' });
    }

    res.json({
      message: 'Producto actualizado exitosamente',
      product: result.rows[0]
    });
  } catch (error) {
    console.error(`Error en /api/products/${req.params.id} [PUT]`, error);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

// Endpoint para eliminar un producto
router.delete('/:id', async (req, res) => {
  try {
    const productId = req.params.id;
    const commerceId = req.user.commerceId;

    // Buscar el producto antes de eliminar para obtener la image_url
    const productQuery = await pool.query(
      "SELECT image_url FROM products WHERE id = $1 AND commerce_id = $2",
      [productId, commerceId]
    );

    if (productQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos para eliminarlo' });
    }

    const imageUrl = productQuery.rows[0].image_url;

    // Si hay imagen en Cloudinary, eliminarla
    if (imageUrl) {
      try {
        // Extraer el public_id correcto de Cloudinary
        const urlParts = imageUrl.split('/');
        // Encontrar el índice de 'upload' en la URL
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
          // El public_id comienza después de 'upload/v{number}/'
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));

          console.log("⚙️ Eliminando imagen de producto con public_id:", publicId);
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (cloudinaryError) {
        console.error("⚠️ Error al eliminar imagen de Cloudinary:", cloudinaryError);
        // Continuar con la eliminación del producto aunque falle la eliminación de la imagen
      }
    }

    // Consulta SQL para eliminar el producto
    const deleteQuery = `
      DELETE FROM products
      WHERE id = $1 AND commerce_id = $2
      RETURNING id
    `;

    const result = await pool.query(deleteQuery, [productId, commerceId]);

    res.json({
      message: 'Producto eliminado exitosamente',
      id: result.rows[0].id
    });
  } catch (error) {
    console.error(`Error en /api/products/${req.params.id} [DELETE]`, error);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

// Endpoint para actualizar la imagen de un producto
router.put('/:id/update-image', upload.single('image'), async (req, res) => {
  const { id } = req.params;

  try {
    const commerceId = req.user.commerceId;

    // Verificar que el producto pertenezca al comercio del usuario
    const checkQuery = `
      SELECT name, image_url FROM products
      WHERE id = $1 AND commerce_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [id, commerceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos' });
    }

    // Verificar si se ha subido un archivo
    if (!req.file) {
      return res.status(400).json({ error: "No se ha proporcionado un archivo" });
    }

    // Obtener información del producto para el nombre del archivo
    const productName = checkResult.rows[0].name;

    // Obtener la imagen actual (si existe) para eliminarla después
    const oldImageUrl = checkResult.rows[0].image_url;

    // Eliminar la imagen anterior de Cloudinary si existe
    if (oldImageUrl) {
      try {
        // Extraer el public_id correcto de Cloudinary
        const urlParts = oldImageUrl.split('/');
        // Encontrar el índice de 'upload' en la URL
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && urlParts.length > uploadIndex + 2) {
          // El public_id comienza después de 'upload/v{number}/'
          const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.'));

          console.log("⚙️ Eliminando imagen anterior de producto con public_id:", publicId);
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
    const sanitizedName = productName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_');

    // Crear un nombre único para el archivo
    const uniqueFilename = `product_${id}_${sanitizedName}_${Date.now()}`;

    // Convertir el buffer a base64 para enviarlo a Cloudinary
    const base64File = `data:${fileType};base64,${fileBuffer.toString('base64')}`;

    console.log("⚙️ Subiendo imagen de producto a Cloudinary con filename:", uniqueFilename);

    // Subir a Cloudinary
    const uploadResult = await cloudinary.uploader.upload(base64File, {
      folder: 'products-images',
      public_id: uniqueFilename,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { width: 800, height: 800, crop: 'limit' } // Limitar tamaño manteniendo proporción
      ]
    });

    console.log("✅ Imagen de producto subida a Cloudinary:", uploadResult.secure_url);

    // Actualizar la URL de la imagen en la base de datos
    await pool.query(
      "UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2 AND commerce_id = $3",
      [uploadResult.secure_url, id, commerceId]
    );

    res.json({
      message: "Imagen de producto actualizada correctamente",
      image_url: uploadResult.secure_url
    });

  } catch (error) {
    console.error(`Error en /api/products/${req.params.id}/update-image [PUT]`, error);
    res.status(500).json({ error: 'Error al actualizar la imagen del producto' });
  }
});

// Exportar router
module.exports = router;