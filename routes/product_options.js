// routes/product_options.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middlewares/authMiddleware');

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
    const { name, required, multiple, max_selections } = req.body;

    const verifyQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const verifyResult = await client.query(verifyQuery, [optionId, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no pertenece a este comercio' });
    }

    const updateQuery = `
      UPDATE product_options
      SET name=$1, required=$2, multiple=$3, max_selections=$4, updated_at=NOW()
      WHERE id=$5 RETURNING *
    `;
    const updateValues = [name, required, multiple, multiple ? max_selections : null, optionId];

    const updateResult = await client.query(updateQuery, updateValues);
    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error al actualizar opción:', error);
    res.status(500).json({ error: 'Error al actualizar la opción' });
  } finally {
    client.release();
  }
});

module.exports = router;