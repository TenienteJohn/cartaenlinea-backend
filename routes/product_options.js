// routes/product_options.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middlewares/authMiddleware');
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const path = require("path");

// Configurar almacenamiento en memoria con Multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 3 * 1024 * 1024, // Limitar a 3MB
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

/**
 * PUT /api/product-options/:id
 * Actualizar una opción de producto
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, required, multiple, max_selections } = req.body;

    // Verificar si la opción pertenece al comercio del usuario
    const verifyQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const verifyResult = await pool.query(verifyQuery, [id, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    // Actualizar opción
    const updateQuery = `
      UPDATE product_options
      SET name = $1, required = $2, multiple = $3, max_selections = $4, updated_at = NOW()
      WHERE id = $5 RETURNING *;
    `;
    const updateValues = [name, required, multiple, multiple ? max_selections : null, id];
    const updateResult = await pool.query(updateQuery, updateValues);

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error al actualizar opción:', error);
    res.status(500).json({ error: 'Error al actualizar opción' });
  }
});

/**
 * DELETE /api/product-options/:id
 * Eliminar una opción de producto y sus ítems asociados
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Verificar si la opción pertenece al comercio del usuario
    const verifyQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const verifyResult = await client.query(verifyQuery, [id, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    await client.query('BEGIN');

    // Eliminar los ítems primero
    await client.query('DELETE FROM option_items WHERE option_id = $1', [id]);

    // Eliminar la opción
    const deleteQuery = `DELETE FROM product_options WHERE id = $1 RETURNING *;`;
    const result = await client.query(deleteQuery, [id]);

    await client.query('COMMIT');

    res.json({ message: 'Opción eliminada exitosamente' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar opción:', error);
    res.status(500).json({ error: 'Error al eliminar opción' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/product-options/:optionId/items/:itemId
 * Eliminar un ítem específico de una opción
 */
router.delete('/:optionId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { optionId, itemId } = req.params;

    // Verificar si el ítem pertenece a una opción dentro del comercio del usuario
    const verifyQuery = `
      SELECT oi.id FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND po.id = $2 AND p.commerce_id = $3
    `;
    const verifyResult = await pool.query(verifyQuery, [itemId, optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no pertenece a este comercio' });
    }

    const deleteQuery = `DELETE FROM option_items WHERE id = $1 RETURNING *;`;
    const result = await pool.query(deleteQuery, [itemId]);

    res.json({ message: 'Ítem eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar ítem:', error);
    res.status(500).json({ error: 'Error al eliminar ítem' });
  }
});

/**
 * GET /api/product-options/:productId
 * Obtener todas las opciones de un producto con sus ítems y etiquetas
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    const optionsQuery = `
      SELECT po.*,
        (
          SELECT json_agg(
            json_build_object(
              'id', t.id,
              'name', t.name,
              'color', t.color,
              'textColor', t.text_color,
              'type', t.type,
              'visible', t.visible,
              'priority', t.priority,
              'discount', t.discount,
              'disableSelection', t.disable_selection,
              'isRecommended', t.is_recommended
            )
          )
          FROM option_tags ot
          JOIN tags t ON ot.tag_id = t.id
          WHERE ot.option_id = po.id AND t.visible = true
        ) AS tags,
        json_agg(
          json_build_object(
            'id', oi.id,
            'name', oi.name,
            'price_addition', oi.price_addition,
            'available', oi.available,
            'image_url', oi.image_url,
            'tags', (
              SELECT json_agg(
                json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'color', t.color,
                  'textColor', t.text_color,
                  'type', t.type,
                  'visible', t.visible,
                  'priority', t.priority,
                  'discount', t.discount,
                  'disableSelection', t.disable_selection,
                  'isRecommended', t.is_recommended
                )
              )
              FROM item_tags it
              JOIN tags t ON it.tag_id = t.id
              WHERE it.item_id = oi.id AND t.visible = true
            )
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) AS items
      FROM product_options po
      LEFT JOIN option_items oi ON po.id = oi.option_id
      WHERE po.product_id = $1
      GROUP BY po.id
      ORDER BY po.id
    `;

    const result = await pool.query(optionsQuery, [productId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener opciones de producto:', error);
    res.status(500).json({ error: 'Error al obtener opciones' });
  }
});

/**
 * POST /api/product-options
 * Crear una nueva opción para un producto
 */
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      product_id,
      name,
      required = false,
      multiple = false,
      max_selections = null,
      items = []
    } = req.body;

    const productQuery = `
      SELECT p.id FROM products p
      WHERE p.id = $1 AND p.commerce_id = $2
    `;
    const productResult = await client.query(productQuery, [product_id, req.user.commerceId]);

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Producto no encontrado o no pertenece a este comercio'
      });
    }

    const insertQuery = `
      INSERT INTO product_options (
        product_id,
        name,
        required,
        multiple,
        max_selections,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      product_id,
      name,
      required,
      multiple,
      multiple ? max_selections : null
    ];

    const result = await client.query(insertQuery, values);
    const optionId = result.rows[0].id;

    if (items && items.length > 0) {
      for (const item of items) {
        const itemInsertQuery = `
          INSERT INTO option_items (
            option_id,
            name,
            price_addition,
            available,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, NOW(), NOW())
        `;

        const itemValues = [
          optionId,
          item.name,
          item.price_addition || 0,
          item.available !== false
        ];

        await client.query(itemInsertQuery, itemValues);
      }
    }

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Error al crear opción de producto:', error);
    res.status(500).json({
      error: 'Error al crear la opción',
      details: error.message
    });
  } finally {
    client.release();
  }
});

/**
 * POST /api/product-options/:optionId/items
 * Agregar un ítem a una opción
 */
router.post('/:optionId/items', authMiddleware, async (req, res) => {
  try {
    const { optionId } = req.params;
    const { name, price_addition, available, image_url } = req.body;

    const optionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;

    const optionResult = await pool.query(optionQuery, [optionId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    const insertQuery = `
      INSERT INTO option_items (
        option_id,
        name,
        price_addition,
        available,
        image_url,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      optionId,
      name,
      price_addition || 0,
      available !== false,
      image_url || null
    ];

    const result = await pool.query(insertQuery, values);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear ítem de opción:', error);
    res.status(500).json({ error: 'Error al crear el ítem' });
  }
});


/**
 * PUT /api/product-options/:optionId
 * Actualizar una opción existente
 */
router.put('/:optionId', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const { optionId } = req.params;
    const { name, required, multiple, max_selections, items } = req.body;

    await client.query('BEGIN');

    // 🛑 1️⃣ Verificar si la opción existe y pertenece al comercio del usuario
    const verifyQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const verifyResult = await client.query(verifyQuery, [optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    // ✅ 2️⃣ Actualizar la opción en la base de datos
    const updateQuery = `
      UPDATE product_options
      SET name=$1, required=$2, multiple=$3, max_selections=$4, updated_at=NOW()
      WHERE id=$5 RETURNING *;
    `;
    const updateValues = [name, required, multiple, multiple ? max_selections : null, optionId];

    const updateResult = await client.query(updateQuery, updateValues);

    // ✅ 3️⃣ ACTUALIZAR los ítems de la opción
    if (items && items.length > 0) {
      // Obtener ítems actuales
      const currentItemsQuery = `SELECT id FROM option_items WHERE option_id = $1`;
      const currentItems = await client.query(currentItemsQuery, [optionId]);
      const currentItemIds = currentItems.rows.map(row => row.id);

      // Encontrar ítems que deberían eliminarse (presentes en DB pero no en la solicitud)
      const requestItemIds = items.filter(item => item.id).map(item => item.id);
      const itemsToDelete = currentItemIds.filter(id => !requestItemIds.includes(id));

      // Eliminar ítems que ya no están en la solicitud
      if (itemsToDelete.length > 0) {
        const deleteItemsQuery = `DELETE FROM option_items WHERE id = ANY($1)`;
        await client.query(deleteItemsQuery, [itemsToDelete]);
      }

      for (const item of items) {
        if (item.id) {
          // 📝 Actualizar un ítem existente
          const updateItemQuery = `
            UPDATE option_items
            SET name=$1, price_addition=$2, available=$3, image_url=$4, updated_at=NOW()
            WHERE id=$5 AND option_id=$6;
          `;
          await client.query(updateItemQuery, [
            item.name,
            item.price_addition || 0,
            item.available !== false,
            item.image_url || null,
            item.id,
            optionId
          ]);
        } else {
          // 📝 Agregar un nuevo ítem a la opción
          const insertItemQuery = `
            INSERT INTO option_items (option_id, name, price_addition, available, image_url, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW());
          `;
          await client.query(insertItemQuery, [
            optionId,
            item.name,
            item.price_addition || 0,
            item.available !== false,
            item.image_url || null
          ]);
        }
      }
    }

    await client.query('COMMIT');

    // 🔄 4️⃣ Obtener la opción actualizada con sus ítems
    const updatedOptionQuery = `
      SELECT po.*,
        json_agg(
          json_build_object(
            'id', oi.id,
            'name', oi.name,
            'price_addition', oi.price_addition,
            'available', oi.available,
            'image_url', oi.image_url
          ) ORDER BY oi.id
        ) FILTER (WHERE oi.id IS NOT NULL) AS items
      FROM product_options po
      LEFT JOIN option_items oi ON po.id = oi.option_id
      WHERE po.id = $1
      GROUP BY po.id;
    `;
    const updatedOptionResult = await client.query(updatedOptionQuery, [optionId]);

    res.json(updatedOptionResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar opción:', error);
    res.status(500).json({ error: 'Error al actualizar la opción' });
  } finally {
    client.release();
  }
});

module.exports = router;

/**
 * PUT /api/product-options/:optionId/items/:itemId
 * Actualizar un ítem dentro de una opción
 */
router.put('/:optionId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { optionId, itemId } = req.params;
    const { name, price_addition, available, image_url } = req.body;

    const verifyQuery = `
      SELECT oi.id FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND po.id = $2 AND p.commerce_id = $3
    `;
    const verifyResult = await pool.query(verifyQuery, [itemId, optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no pertenece a este comercio' });
    }

    const updateQuery = `
      UPDATE option_items
      SET name = $1, price_addition = $2, available = $3, image_url = $4, updated_at = NOW()
      WHERE id = $5 RETURNING *;
    `;
    const updateValues = [name, price_addition || 0, available, image_url || null, itemId];
    const updateResult = await pool.query(updateQuery, updateValues);

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error al actualizar ítem:', error);
    res.status(500).json({ error: 'Error al actualizar el ítem' });
  }
});

/**
 * DELETE /api/product-options/:optionId/items/:itemId
 * Eliminar un ítem dentro de una opción
 */
router.delete('/:optionId/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { optionId, itemId } = req.params;

    const verifyQuery = `
      SELECT oi.id FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND po.id = $2 AND p.commerce_id = $3
    `;
    const verifyResult = await pool.query(verifyQuery, [itemId, optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no pertenece a este comercio' });
    }

    const deleteQuery = `DELETE FROM option_items WHERE id = $1 RETURNING *;`;
    const deleteResult = await pool.query(deleteQuery, [itemId]);

    res.json({ message: 'Ítem eliminado exitosamente', deletedItem: deleteResult.rows[0] });
  } catch (error) {
    console.error('Error al eliminar ítem:', error);
    res.status(500).json({ error: 'Error al eliminar el ítem' });
  }
});

/**
 * PUT /api/product-options/:optionId/items/:itemId/update-image
 * Actualizar la imagen de un ítem de opción
 */
router.put('/:optionId/items/:itemId/update-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { optionId, itemId } = req.params;

    // Verificar que el ítem pertenezca a una opción dentro del comercio del usuario
    const verifyQuery = `
      SELECT oi.id, oi.name, oi.image_url FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND po.id = $2 AND p.commerce_id = $3
    `;
    const verifyResult = await pool.query(verifyQuery, [itemId, optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no pertenece a este comercio' });
    }

    // Verificar si se ha subido un archivo
    if (!req.file) {
      return res.status(400).json({ error: "No se ha proporcionado un archivo" });
    }

    const item = verifyResult.rows[0];

    // Obtener la imagen actual (si existe) para eliminarla después
    const oldImageUrl = item.image_url;

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

          console.log("⚙️ Eliminando imagen anterior de item con public_id:", publicId);
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
    const sanitizedName = item.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_');

    // Crear un nombre único para el archivo
    const uniqueFilename = `option_item_${itemId}_${sanitizedName}_${Date.now()}`;

    // Convertir el buffer a base64 para enviarlo a Cloudinary
    const base64File = `data:${fileType};base64,${fileBuffer.toString('base64')}`;

    console.log("⚙️ Subiendo imagen de item de opción a Cloudinary con filename:", uniqueFilename);

    // Subir a Cloudinary con tamaño optimizado para miniaturas
    const uploadResult = await cloudinary.uploader.upload(base64File, {
      folder: 'option-items-images',
      public_id: uniqueFilename,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { width: 150, height: 150, crop: 'fill', gravity: "auto" } // Cuadrado optimizado para miniaturas
      ]
    });

    console.log("✅ Imagen de item subida a Cloudinary:", uploadResult.secure_url);

    // Actualizar la URL de la imagen en la base de datos
    await pool.query(
      "UPDATE option_items SET image_url = $1, updated_at = NOW() WHERE id = $2",
      [uploadResult.secure_url, itemId]
    );

    res.json({
      message: "Imagen de item actualizada correctamente",
      image_url: uploadResult.secure_url
    });

  } catch (error) {
    console.error(`Error en /api/product-options/${req.params.optionId}/items/${req.params.itemId}/update-image [PUT]`, error);
    res.status(500).json({ error: 'Error al actualizar la imagen del item' });
  }
});

module.exports = router;
