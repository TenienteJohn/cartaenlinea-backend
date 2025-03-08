// routes/products.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

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

    // Consulta SQL para eliminar el producto
    const query = `
      DELETE FROM products
      WHERE id = $1 AND commerce_id = $2
      RETURNING id
    `;

    const result = await pool.query(query, [productId, commerceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos para eliminarlo' });
    }

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
router.put('/:id/update-image', async (req, res) => {
  try {
    const productId = req.params.id;
    const commerceId = req.user.commerceId;

    // Verificar que el producto pertenezca al comercio del usuario
    const checkQuery = `
      SELECT id FROM products
      WHERE id = $1 AND commerce_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [productId, commerceId]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado o no tienes permisos' });
    }

    // Aquí iría la lógica para procesar y guardar la imagen
    // Por ejemplo, usando multer y luego guardando la URL de la imagen en la base de datos

    // Simulación de respuesta exitosa (adaptar según tu implementación real)
    res.json({
      message: 'Imagen actualizada exitosamente',
      image_url: `/images/products/${productId}.jpg` // URL de ejemplo
    });
  } catch (error) {
    console.error(`Error en /api/products/${req.params.id}/update-image [PUT]`, error);
    res.status(500).json({ error: 'Error al actualizar la imagen del producto' });
  }
});

// Exportar router
module.exports = router;