// routes/product_options.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateProductOption } = require('../validators/product-option-validator');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/product-options/:productId
 * Obtener todas las opciones de un producto con sus ítems
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    // Obtener todas las opciones del producto
    const optionsQuery = `
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
    // Iniciar transacción
    await client.query('BEGIN');

    const {
      product_id,
      name,
      required = false,
      multiple = false,
      max_selections = null,
      items = []
    } = req.body;

    // Usar el validador
    const validationResult = validateProductOption({
      product_id,
      name,
      required,
      multiple,
      max_selections,
      items
    });

    if (!validationResult.isValid) {
      return res.status(400).json({
        error: 'Error de validación',
        details: validationResult.errors
      });
    }

    // Verificar que el producto exista y pertenezca al commerce del usuario
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

    // Insertar la nueva opción
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

    // Si hay items, procesarlos
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
          RETURNING *
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

    // Confirmar transacción
    await client.query('COMMIT');

    // Obtener la opción con sus items para devolverla
    const fullOptionQuery = `
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
      GROUP BY po.id
    `;

    const fullOptionResult = await pool.query(fullOptionQuery, [optionId]);
    const fullOption = fullOptionResult.rows[0];

    res.status(201).json(fullOption);
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

    // Validar datos básicos del item
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'El nombre del item es obligatorio' });
    }

    // Verificar que la opción pertenezca a un producto del commerce del usuario
    const optionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;

    const optionResult = await pool.query(optionQuery, [optionId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    // Insertar el nuevo ítem
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
 * Actualizar una opción de producto
 */
router.put('/:optionId', authMiddleware, async (req, res) => {
  try {
    const { optionId } = req.params;
    const { name, required, multiple, max_selections } = req.body;

    // Validar datos básicos
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'El nombre de la opción es obligatorio' });
    }

    // Verificar que la opción pertenezca a un producto del commerce del usuario
    const optionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;

    const optionResult = await pool.query(optionQuery, [optionId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    // Actualizar la opción
    const updateQuery = `
      UPDATE product_options
      SET name = $1,
          required = $2,
          multiple = $3,
          max_selections = $4,
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;

    const values = [
      name,
      required,
      multiple,
      multiple ? max_selections : null,
      optionId
    ];

    const result = await pool.query(updateQuery, values);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar opción de producto:', error);
    res.status(500).json({ error: 'Error al actualizar la opción' });
  }
});

/**
 * DELETE /api/product-options/:optionId
 * Eliminar una opción de producto
 */
router.delete('/:optionId', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { optionId } = req.params;

    // Verificar que la opción pertenezca a un producto del commerce del usuario
    const optionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;

    const optionResult = await client.query(optionQuery, [optionId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    // Primero eliminar los items asociados
    await client.query('DELETE FROM option_items WHERE option_id = $1', [optionId]);

    // Luego eliminar la opción
    const deleteResult = await client.query('DELETE FROM product_options WHERE id = $1 RETURNING *', [optionId]);

    await client.query('COMMIT');
    res.json(deleteResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al eliminar opción de producto:', error);
    res.status(500).json({ error: 'Error al eliminar la opción' });
  } finally {
    client.release();
  }
});

module.exports = router;