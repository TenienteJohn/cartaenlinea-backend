const express = require('express');
const router = express.Router();
const pool = require('../db');

// Endpoint público para obtener la carta de un comercio por subdominio
router.get('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;

    // Obtener información del comercio
    const commerceQuery = 'SELECT * FROM commerces WHERE subdomain = $1';
    const commerceResult = await pool.query(commerceQuery, [subdomain]);

    if (commerceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const commerce = commerceResult.rows[0];

    // Obtener categorías y productos
    const categoriesQuery = `
      SELECT c.id, c.name, 
        json_agg(json_build_object('id', p.id, 'name', p.name, 'image_url', p.image_url, 'description', p.description, 'price', p.price)) AS products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE c.commerce_id = $1
      GROUP BY c.id, c.name
    `;

    const categoriesResult = await pool.query(categoriesQuery, [commerce.id]);

    res.json({
      commerce,
      categories: categoriesResult.rows,
    });
  } catch (error) {
    console.error('Error al obtener la carta:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;
