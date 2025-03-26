// routes/tags.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middlewares/authMiddleware');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/tags/product/:productId
 * Obtener todas las etiquetas asignadas a un producto
 */
router.get('/product/:productId', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.params;

    // Verificar que el producto pertenezca al comercio del usuario
    const verifyProductQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;
    const productResult = await pool.query(verifyProductQuery, [productId, req.user.commerceId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a este comercio' });
    }

    // Consulta para obtener las etiquetas del producto
    const query = `
      SELECT t.id, t.name, t.color, t.text_color as "textColor",
             t.type, t.visible, t.priority, t.discount,
             t.disable_selection as "disableSelection",
             t.is_recommended as "isRecommended"
      FROM tags t
      JOIN product_tags pt ON t.id = pt.tag_id
      WHERE pt.product_id = $1
      ORDER BY t.priority DESC, t.name
    `;
    const result = await pool.query(query, [productId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener etiquetas del producto:', error);
    res.status(500).json({ error: 'Error al obtener etiquetas del producto' });
  }
});

/**
 * GET /api/tags
 * Obtener todas las etiquetas del usuario actual
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT * FROM tags
      WHERE commerce_id = $1
      ORDER BY type, priority DESC, name
    `;
    const result = await pool.query(query, [req.user.commerceId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener etiquetas:', error);
    res.status(500).json({ error: 'Error al obtener etiquetas' });
  }
});

/**
 * POST /api/tags
 * Crear una nueva etiqueta
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name,
      color,
      textColor = '#FFFFFF',
      type,
      visible = true,
      priority = 0,
      discount = null,
      disableSelection = false,
      isRecommended = false
    } = req.body;

    // Validar datos requeridos
    if (!name || !color || !type) {
      return res.status(400).json({ error: 'Nombre, color y tipo son obligatorios' });
    }

    // Validar tipo
    if (!['product', 'option', 'item'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de etiqueta inválido' });
    }

    const query = `
      INSERT INTO tags (
        name, color, text_color, type, visible, priority, discount,
        disable_selection, is_recommended, commerce_id, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING *
    `;

    const values = [
      name, color, textColor, type, visible, priority, discount,
      disableSelection, isRecommended, req.user.commerceId
    ];

    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al crear etiqueta:', error);
    res.status(500).json({ error: 'Error al crear etiqueta' });
  }
});

/**
 * PUT /api/tags/:id
 * Actualizar una etiqueta existente
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      color,
      textColor,
      type,
      visible,
      priority,
      discount,
      disableSelection,
      isRecommended
    } = req.body;

    // Verificar propiedad
    const verifyQuery = `
      SELECT id FROM tags
      WHERE id = $1 AND commerce_id = $2
    `;
    const verifyResult = await pool.query(verifyQuery, [id, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no tiene permisos' });
    }

    const query = `
      UPDATE tags SET
        name = COALESCE($1, name),
        color = COALESCE($2, color),
        text_color = COALESCE($3, text_color),
        type = COALESCE($4, type),
        visible = COALESCE($5, visible),
        priority = COALESCE($6, priority),
        discount = $7,
        disable_selection = COALESCE($8, disable_selection),
        is_recommended = COALESCE($9, is_recommended),
        updated_at = NOW()
      WHERE id = $10 AND commerce_id = $11
      RETURNING *
    `;

    const values = [
      name, color, textColor, type, visible, priority, discount,
      disableSelection, isRecommended, id, req.user.commerceId
    ];

    const result = await pool.query(query, values);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al actualizar etiqueta:', error);
    res.status(500).json({ error: 'Error al actualizar etiqueta' });
  }
});

/**
 * DELETE /api/tags/:id
 * Eliminar una etiqueta
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar propiedad
    const verifyQuery = `
      SELECT id FROM tags
      WHERE id = $1 AND commerce_id = $2
    `;
    const verifyResult = await pool.query(verifyQuery, [id, req.user.commerceId]);

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no tiene permisos' });
    }

    // Eliminar etiqueta
    await pool.query('DELETE FROM tags WHERE id = $1', [id]);

    // Eliminar asignaciones de etiquetas
    await pool.query('DELETE FROM product_tags WHERE tag_id = $1', [id]);
    await pool.query('DELETE FROM option_tags WHERE tag_id = $1', [id]);
    await pool.query('DELETE FROM item_tags WHERE tag_id = $1', [id]);

    res.json({ message: 'Etiqueta eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar etiqueta:', error);
    res.status(500).json({ error: 'Error al eliminar etiqueta' });
  }
});

/**
 * POST /api/tags/assign-product/:productId/:tagId
 * Asignar etiqueta a un producto
 */
router.post('/assign-product/:productId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { productId, tagId } = req.params;

    // Verificar que el producto y la etiqueta pertenezcan al comercio
    const verifyProductQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;
    const verifyTagQuery = `
      SELECT id, type FROM tags
      WHERE id = $1 AND commerce_id = $2
    `;

    const productResult = await pool.query(verifyProductQuery, [productId, req.user.commerceId]);
    const tagResult = await pool.query(verifyTagQuery, [tagId, req.user.commerceId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tiene permisos' });
    }

    if (tagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no tiene permisos' });
    }

    // Verificar que la etiqueta sea de tipo producto
    if (tagResult.rows[0].type !== 'product') {
      return res.status(400).json({ error: 'La etiqueta debe ser de tipo producto' });
    }

    // Verificar si ya existe la asignación
    const checkQuery = `
      SELECT id FROM product_tags
      WHERE product_id = $1 AND tag_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [productId, tagId]);

    if (checkResult.rows.length > 0) {
      // Ya existe, no hacer nada
      return res.status(200).json({ message: 'La etiqueta ya está asignada al producto' });
    }

    // Asignar etiqueta al producto
    const query = `
      INSERT INTO product_tags (product_id, tag_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [productId, tagId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al asignar etiqueta al producto:', error);
    res.status(500).json({ error: 'Error al asignar etiqueta al producto' });
  }
});

/**
 * DELETE /api/tags/assign-product/:productId/:tagId
 * Quitar etiqueta de un producto
 */
router.delete('/assign-product/:productId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { productId, tagId } = req.params;

    // Verificar que el producto pertenezca al comercio
    const verifyProductQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;
    const productResult = await pool.query(verifyProductQuery, [productId, req.user.commerceId]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tiene permisos' });
    }

    // Eliminar asignación
    const query = `
      DELETE FROM product_tags
      WHERE product_id = $1 AND tag_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [productId, tagId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    res.json({ message: 'Etiqueta eliminada del producto correctamente' });
  } catch (error) {
    console.error('Error al quitar etiqueta del producto:', error);
    res.status(500).json({ error: 'Error al quitar etiqueta del producto' });
  }
});

/**
 * POST /api/tags/assign-option/:optionId/:tagId
 * Asignar etiqueta a una opción
 */
router.post('/assign-option/:optionId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { optionId, tagId } = req.params;

    // Verificar que la opción pertenezca al comercio
    const verifyOptionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const verifyTagQuery = `
      SELECT id, type FROM tags
      WHERE id = $1 AND commerce_id = $2
    `;

    const optionResult = await pool.query(verifyOptionQuery, [optionId, req.user.commerceId]);
    const tagResult = await pool.query(verifyTagQuery, [tagId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no tiene permisos' });
    }

    if (tagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no tiene permisos' });
    }

    // Verificar que la etiqueta sea de tipo opción
    if (tagResult.rows[0].type !== 'option') {
      return res.status(400).json({ error: 'La etiqueta debe ser de tipo opción' });
    }

    // Verificar si ya existe la asignación
    const checkQuery = `
      SELECT id FROM option_tags
      WHERE option_id = $1 AND tag_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [optionId, tagId]);

    if (checkResult.rows.length > 0) {
      // Ya existe, no hacer nada
      return res.status(200).json({ message: 'La etiqueta ya está asignada a la opción' });
    }

    // Asignar etiqueta a la opción
    const query = `
      INSERT INTO option_tags (option_id, tag_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [optionId, tagId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al asignar etiqueta a la opción:', error);
    res.status(500).json({ error: 'Error al asignar etiqueta a la opción' });
  }
});

/**
 * DELETE /api/tags/assign-option/:optionId/:tagId
 * Quitar etiqueta de una opción
 */
router.delete('/assign-option/:optionId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { optionId, tagId } = req.params;

    // Verificar que la opción pertenezca al comercio
    const verifyOptionQuery = `
      SELECT po.id FROM product_options po
      JOIN products p ON po.product_id = p.id
      WHERE po.id = $1 AND p.commerce_id = $2
    `;
    const optionResult = await pool.query(verifyOptionQuery, [optionId, req.user.commerceId]);

    if (optionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Opción no encontrada o no tiene permisos' });
    }

    // Eliminar asignación
    const query = `
      DELETE FROM option_tags
      WHERE option_id = $1 AND tag_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [optionId, tagId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    res.json({ message: 'Etiqueta eliminada de la opción correctamente' });
  } catch (error) {
    console.error('Error al quitar etiqueta de la opción:', error);
    res.status(500).json({ error: 'Error al quitar etiqueta de la opción' });
  }
});

/**
 * POST /api/tags/assign-item/:itemId/:tagId
 * Asignar etiqueta a un ítem
 */
router.post('/assign-item/:itemId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { itemId, tagId } = req.params;

    // Verificar que el ítem pertenezca al comercio
    const verifyItemQuery = `
      SELECT oi.id FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND p.commerce_id = $2
    `;
    const verifyTagQuery = `
      SELECT id, type FROM tags
      WHERE id = $1 AND commerce_id = $2
    `;

    const itemResult = await pool.query(verifyItemQuery, [itemId, req.user.commerceId]);
    const tagResult = await pool.query(verifyTagQuery, [tagId, req.user.commerceId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no tiene permisos' });
    }

    if (tagResult.rows.length === 0) {
      return res.status(404).json({ error: 'Etiqueta no encontrada o no tiene permisos' });
    }

    // Verificar que la etiqueta sea de tipo ítem
    if (tagResult.rows[0].type !== 'item') {
      return res.status(400).json({ error: 'La etiqueta debe ser de tipo ítem' });
    }

    // Verificar si ya existe la asignación
    const checkQuery = `
      SELECT id FROM item_tags
      WHERE item_id = $1 AND tag_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [itemId, tagId]);

    if (checkResult.rows.length > 0) {
      // Ya existe, no hacer nada
      return res.status(200).json({ message: 'La etiqueta ya está asignada al ítem' });
    }

    // Asignar etiqueta al ítem
    const query = `
      INSERT INTO item_tags (item_id, tag_id, created_at)
      VALUES ($1, $2, NOW())
      RETURNING *
    `;
    const result = await pool.query(query, [itemId, tagId]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al asignar etiqueta al ítem:', error);
    res.status(500).json({ error: 'Error al asignar etiqueta al ítem' });
  }
});

/**
 * DELETE /api/tags/assign-item/:itemId/:tagId
 * Quitar etiqueta de un ítem
 */
router.delete('/assign-item/:itemId/:tagId', authMiddleware, async (req, res) => {
  try {
    const { itemId, tagId } = req.params;

    // Verificar que el ítem pertenezca al comercio
    const verifyItemQuery = `
      SELECT oi.id FROM option_items oi
      JOIN product_options po ON oi.option_id = po.id
      JOIN products p ON po.product_id = p.id
      WHERE oi.id = $1 AND p.commerce_id = $2
    `;
    const itemResult = await pool.query(verifyItemQuery, [itemId, req.user.commerceId]);

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Ítem no encontrado o no tiene permisos' });
    }

    // Eliminar asignación
    const query = `
      DELETE FROM item_tags
      WHERE item_id = $1 AND tag_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [itemId, tagId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Asignación no encontrada' });
    }

    res.json({ message: 'Etiqueta eliminada del ítem correctamente' });
  } catch (error) {
    console.error('Error al quitar etiqueta del ítem:', error);
    res.status(500).json({ error: 'Error al quitar etiqueta del ítem' });
  }
});

module.exports = router;