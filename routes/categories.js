// routes/categories.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Ajusta si usas un pool compartido en otro módulo
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/categories
 * Listar todas las categorías del comercio actual
 */
router.get('/', async (req, res) => {
  try {
    // Verificamos rol del usuario
    if (req.user.role === 'SUPERUSER') {
      // El superusuario puede listar todas las categorías de todos los comercios
      // o puedes implementar "impersonar" recibiendo commerce_id. Depende de tu lógica.
      const result = await pool.query('SELECT * FROM categories ORDER BY position, id ASC');
      return res.json(result.rows);
    } else {
      // Si es OWNER, listamos solo categorías de su commerce_id
      const commerceId = req.user.commerceId;
      if (!commerceId) {
        return res.status(400).json({ error: 'No se encontró commerce_id para el usuario' });
      }

      const query = 'SELECT * FROM categories WHERE commerce_id = $1 ORDER BY position, id ASC';
      const values = [commerceId];
      const result = await pool.query(query, values);
      return res.json(result.rows);
    }
  } catch (error) {
    console.error('Error en GET /categories:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

/**
 * POST /api/categories
 * Crear una nueva categoría
 */
router.post('/', async (req, res) => {
  try {
    const { name, commerce_id, position } = req.body;

    // Verificar el rol
    let finalCommerceId;
    if (req.user.role === 'SUPERUSER') {
      // El superusuario puede asignar manualmente un commerce_id si lo desea
      // o podrías forzarle a pasar commerce_id en el body
      finalCommerceId = commerce_id;
      if (!finalCommerceId) {
        return res.status(400).json({ error: 'Debe proveer commerce_id para crear categoría como SUPERUSER' });
      }
    } else {
      // Si es OWNER, usamos su commerceId
      finalCommerceId = req.user.commerceId;
      if (!finalCommerceId) {
        return res.status(400).json({ error: 'No se encontró commerce_id asociado al usuario OWNER' });
      }
    }

    // Obtener la última posición para asignar la nueva categoría al final si no se proporciona position
    let newPosition = position;

    // Si no proporcionaron position explícitamente, calcular la siguiente position
    if (newPosition === undefined) {
      const maxPositionResult = await pool.query(
        'SELECT MAX(position) as max_pos FROM categories WHERE commerce_id = $1',
        [finalCommerceId]
      );

      const maxPosition = maxPositionResult.rows[0].max_pos || -1;
      newPosition = maxPosition + 1;
    }

    // Insertar la categoría
    const query = `
      INSERT INTO categories (commerce_id, name, position)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [finalCommerceId, name, newPosition];
    const result = await pool.query(query, values);

    return res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    console.error('Error en POST /categories:', error);
    res.status(500).json({ error: 'Error al crear la categoría' });
  }
});

/**
 * GET /api/categories/:id
 * Obtener una categoría por ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'SUPERUSER') {
      // Superusuario puede ver cualquier categoría
      const query = 'SELECT * FROM categories WHERE id = $1';
      const values = [id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
      }
      return res.json(result.rows[0]);
    } else {
      // OWNER: Solo puede ver categorías de su comercio
      const commerceId = req.user.commerceId;
      const query = 'SELECT * FROM categories WHERE id = $1 AND commerce_id = $2';
      const values = [id, commerceId];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada o no pertenece a este tenant' });
      }
      return res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error en GET /categories/:id:', error);
    res.status(500).json({ error: 'Error al obtener la categoría' });
  }
});

/**
 * PUT /api/categories/:id
 * Actualizar una categoría (nombre)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, position } = req.body;

    if (req.user.role === 'SUPERUSER') {
      // Actualizar sin filtrar commerce_id
      const query = `
        UPDATE categories
        SET name = $1,
            position = COALESCE($2, position),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      const values = [name, position, id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
      }
      return res.json({ category: result.rows[0] });
    } else {
      // OWNER: Solo actualiza las categorías de su commerce_id
      const commerceId = req.user.commerceId;
      const query = `
        UPDATE categories
        SET name = $1,
            position = COALESCE($2, position),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND commerce_id = $4
        RETURNING *
      `;
      const values = [name, position, id, commerceId];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada o no pertenece a este tenant' });
      }
      return res.json({ category: result.rows[0] });
    }
  } catch (error) {
    console.error('Error en PUT /categories/:id:', error);
    res.status(500).json({ error: 'Error al actualizar la categoría' });
  }
});

/**
 * DELETE /api/categories/:id
 * Eliminar una categoría
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'SUPERUSER') {
      const query = 'DELETE FROM categories WHERE id = $1 RETURNING *';
      const values = [id];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
      }
      return res.json({ message: 'Categoría eliminada', category: result.rows[0] });
    } else {
      // OWNER
      const commerceId = req.user.commerceId;
      const query = 'DELETE FROM categories WHERE id = $1 AND commerce_id = $2 RETURNING *';
      const values = [id, commerceId];
      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Categoría no encontrada o no pertenece a este tenant' });
      }
      return res.json({ message: 'Categoría eliminada', category: result.rows[0] });
    }
  } catch (error) {
    console.error('Error en DELETE /categories/:id:', error);
    res.status(500).json({ error: 'Error al eliminar la categoría' });
  }
});

/**
 * POST /api/categories/reorder
 * Reordenar las categorías de un comercio
 */
router.post('/reorder', async (req, res) => {
  try {
    const { categories } = req.body;

    // Verificar que categories sea un array
    if (!Array.isArray(categories)) {
      return res.status(400).json({ error: 'El formato de datos es inválido' });
    }

    // Validar la estructura de cada elemento
    for (const category of categories) {
      if (!category.id || typeof category.position !== 'number') {
        return res.status(400).json({ error: 'Algunas categorías tienen un formato inválido' });
      }
    }

    // Verificar que el usuario tenga acceso a estas categorías
    const commerceId = req.user.commerceId;

    // Verificar que todas las categorías pertenezcan al comercio del usuario (excepto SUPERUSER)
    if (req.user.role !== 'SUPERUSER') {
      const categoryIds = categories.map(cat => cat.id);

      const existingCategoriesResult = await pool.query(
        'SELECT id FROM categories WHERE id = ANY($1) AND commerce_id = $2',
        [categoryIds, commerceId]
      );

      if (existingCategoriesResult.rows.length !== categoryIds.length) {
        return res.status(403).json({
          error: 'Algunas categorías no existen o no pertenecen a su comercio',
          found: existingCategoriesResult.rows.length,
          expected: categoryIds.length
        });
      }
    }

    // Actualizar el orden de las categorías en una transacción
    await pool.query('BEGIN');

    try {
      // Actualizar la posición de cada categoría
      for (const category of categories) {
        // El SUPERUSER puede reordenar cualquier categoría
        if (req.user.role === 'SUPERUSER') {
          await pool.query(
            'UPDATE categories SET position = $1 WHERE id = $2',
            [category.position, category.id]
          );
        } else {
          // Los OWNER solo pueden reordenar categorías de su comercio
          await pool.query(
            'UPDATE categories SET position = $1 WHERE id = $2 AND commerce_id = $3',
            [category.position, category.id, commerceId]
          );
        }
      }

      await pool.query('COMMIT');

      // Obtener las categorías actualizadas
      let updatedCategoriesResult;

      if (req.user.role === 'SUPERUSER') {
        updatedCategoriesResult = await pool.query(
          'SELECT * FROM categories WHERE id = ANY($1) ORDER BY position',
          [categories.map(cat => cat.id)]
        );
      } else {
        updatedCategoriesResult = await pool.query(
          'SELECT * FROM categories WHERE commerce_id = $1 ORDER BY position',
          [commerceId]
        );
      }

      res.json({
        message: 'Orden de categorías actualizado correctamente',
        categories: updatedCategoriesResult.rows
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error en POST /categories/reorder:', error);
    res.status(500).json({ error: 'Error al reordenar las categorías' });
  }
});

module.exports = router;
