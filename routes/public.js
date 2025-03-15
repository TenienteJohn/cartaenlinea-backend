// routes/product_options.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middlewares/authMiddleware');

// Inicializar el pool directamente en lugar de importarlo
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

/**
 * GET /api/products/:productId/options
 * Obtener todas las opciones de un producto con sus items
 */
router.get('/:productId/options', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;
    const commerceId = req.user.commerceId;

    // Verificar que el producto pertenezca al comercio del usuario
    const productQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;
    const productResult = await pool.query(productQuery, [productId, commerceId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos para acceder a él' });
    }

    // Obtener las opciones del producto
    const optionsQuery = `
      SELECT po.* FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.product_id = $1 AND p.commerce_id = $2
      ORDER BY po.id
    `;
    const optionsResult = await pool.query(optionsQuery, [productId, commerceId]);
    const options = optionsResult.rows;

    // Para cada opción, obtener sus items
    for (const option of options) {
      const itemsQuery = `
        SELECT * FROM option_items
        WHERE option_id = $1
        ORDER BY id
      `;
      const itemsResult = await pool.query(itemsQuery, [option.id]);
      option.items = itemsResult.rows;
    }

    res.json(options);
  } catch (error) {
    console.error('Error al obtener opciones del producto:', error);
    res.status(500).json({ error: 'Error al obtener las opciones del producto' });
  }
});

/**
 * POST /api/products/:productId/options
 * Crear una nueva opción para un producto
 */
router.post('/:productId/options', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { productId } = req.params;
    const { name, required, multiple, max_selections, items } = req.body;
    const commerceId = req.user.commerceId;

    // Verificar que el producto pertenezca al comercio del usuario
    const productQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;
    const productResult = await client.query(productQuery, [productId, commerceId]);

    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos para modificarlo' });
    }

    // Crear la nueva opción
    const optionQuery = `
      INSERT INTO product_options (product_id, name, required, multiple, max_selections, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    const optionValues = [productId, name, required || false, multiple || false, max_selections || null];
    const optionResult = await client.query(optionQuery, optionValues);

    const option = optionResult.rows[0];
    option.items = [];

    // Si hay items, insertarlos
    if (items && items.length > 0) {
      for (const item of items) {
        const itemQuery = `
          INSERT INTO option_items (option_id, name, price_addition, available, image_url, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `;
        const itemValues = [
          option.id,
          item.name,
          item.price_addition || 0,
          item.available !== false, // Por defecto disponible
          item.image_url || null
        ];

        const itemResult = await client.query(itemQuery, itemValues);
        option.items.push(itemResult.rows[0]);
      }
    }

    await client.query('COMMIT');
    res.status(201).json(option);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al agregar opción al producto:', error);
    res.status(500).json({ error: 'Error al agregar la opción al producto' });
  } finally {
    client.release();
  }
});

/**
 * PUT /api/options/:optionId
 * Actualizar una opción existente
 */
router.put('/options/:optionId', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { optionId } = req.params;
    const { name, required, multiple, max_selections, items } = req.body;
    const commerceId = req.user.commerceId;

    // Verificar que la opción exista y pertenezca a un producto del comercio del usuario
    const optionQuery = `
      SELECT po.* FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const optionResult = await client.query(optionQuery, [optionId, commerceId]);

    if (optionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opción no encontrada o no tienes permisos para modificarla' });
    }

    // Actualizar la opción
    const updateQuery = `
      UPDATE product_options
      SET name = $1, required = $2, multiple = $3, max_selections = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const updateValues = [name, required, multiple, max_selections, optionId];
    const updateResult = await client.query(updateQuery, updateValues);

    const option = updateResult.rows[0];

    // Si se enviaron items, actualizar
    if (items) {
      // Eliminar items existentes
      await client.query('DELETE FROM option_items WHERE option_id = $1', [optionId]);

      // Insertar nuevos items
      option.items = [];
      for (const item of items) {
        const itemQuery = `
          INSERT INTO option_items (option_id, name, price_addition, available, image_url, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING *
        `;
        const itemValues = [
          option.id,
          item.name,
          item.price_addition || 0,
          item.available !== false,
          item.image_url || null
        ];

        const itemResult = await client.query(itemQuery, itemValues);
        option.items.push(itemResult.rows[0]);
      }
    } else {
      // Si no se enviaron items, obtener los existentes
      const itemsQuery = 'SELECT * FROM option_items WHERE option_id = $1';
      const itemsResult = await client.query(itemsQuery, [optionId]);
      option.items = itemsResult.rows;
    }

    await client.query('COMMIT');
    res.json(option);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar opción:', error);
    res.status(500).json({ error: 'Error al actualizar la opción' });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/options/:optionId
 * Eliminar una opción
 */
router.delete('/options/:optionId', authMiddleware, async (req, res) => {
  try {
    const { optionId } = req.params;
    const commerceId = req.user.commerceId;

    // Verificar que la opción exista y pertenezca a un producto del comercio del usuario
    const optionQuery = `
      SELECT po.* FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const optionResult = await pool.query(optionQuery, [optionId, commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no tienes permisos para eliminarla' });
    }

    // Eliminar la opción (los items se eliminarán automáticamente por la restricción ON DELETE CASCADE)
    const deleteQuery = 'DELETE FROM product_options WHERE id = $1 RETURNING *';
    const deleteResult = await pool.query(deleteQuery, [optionId]);

    res.json({
      message: 'Opción eliminada correctamente',
      option: deleteResult.rows[0]
    });

  } catch (error) {
    console.error('Error al eliminar opción:', error);
    res.status(500).json({ error: 'Error al eliminar la opción' });
  }
});

/**
 * POST /api/options/:optionId/items
 * Agregar un nuevo item a una opción
 */
router.post('/options/:optionId/items', authMiddleware, async (req, res) => {
  try {
    const { optionId } = req.params;
    const { name, price_addition, available, image_url } = req.body;
    const commerceId = req.user.commerceId;

    // Verificar que la opción exista y pertenezca a un producto del comercio del usuario
    const optionQuery = `
      SELECT po.* FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const optionResult = await pool.query(optionQuery, [optionId, commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no tienes permisos para modificarla' });
    }

    // Insertar el nuevo item
    const itemQuery = `
      INSERT INTO option_items (option_id, name, price_addition, available, image_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    const itemValues = [optionId, name, price_addition || 0, available !== false, image_url || null];

    const result = await pool.query(itemQuery, itemValues);
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Error al agregar item a la opción:', error);
    res.status(500).json({ error: 'Error al agregar el item a la opción' });
  }
});

/**
 * PUT /api/items/:itemId
 * Actualizar un item existente
 */
router.put('/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { name, price_addition, available, image_url } = req.body;
    const commerceId = req.user.commerceId;

    // Verificar que el item exista y pertenezca a una opción de un producto del comercio del usuario
    const itemQuery = `
      SELECT i.* FROM option_items i
      JOIN product_options po ON i.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE i.id = $1 AND p.commerce_id = $2
    `;
    const itemResult = await pool.query(itemQuery, [itemId, commerceId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado o no tienes permisos para modificarlo' });
    }

    // Actualizar el item
    const updateQuery = `
      UPDATE option_items
      SET name = $1, price_addition = $2, available = $3, image_url = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    const updateValues = [name, price_addition, available, image_url, itemId];

    const result = await pool.query(updateQuery, updateValues);
    res.json(result.rows[0]);

  } catch (error) {
    console.error('Error al actualizar item:', error);
    res.status(500).json({ error: 'Error al actualizar el item' });
  }
});

/**
 * DELETE /api/items/:itemId
 * Eliminar un item
 */
router.delete('/items/:itemId', authMiddleware, async (req, res) => {
  try {
    const { itemId } = req.params;
    const commerceId = req.user.commerceId;

    // Verificar que el item exista y pertenezca a una opción de un producto del comercio del usuario
    const itemQuery = `
      SELECT i.* FROM option_items i
      JOIN product_options po ON i.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE i.id = $1 AND p.commerce_id = $2
    `;
    const itemResult = await pool.query(itemQuery, [itemId, commerceId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item no encontrado o no tienes permisos para eliminarlo' });
    }

    // Eliminar el item
    const deleteQuery = 'DELETE FROM option_items WHERE id = $1 RETURNING *';
    const deleteResult = await pool.query(deleteQuery, [itemId]);

    res.json({
      message: 'Item eliminado correctamente',
      item: deleteResult.rows[0]
    });

  } catch (error) {
    console.error('Error al eliminar item:', error);
    res.status(500).json({ error: 'Error al eliminar el item' });
  }
});

module.exports = router;