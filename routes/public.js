// routes/public.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Inicializar el pool directamente en lugar de importarlo
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

// Endpoint público para obtener la carta de un comercio por subdominio
router.get('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;

    console.log(`API: Obteniendo datos para subdominio: ${subdomain}`);

    // Obtener información del comercio con todos los campos
    const commerceQuery = `
      SELECT
        id, business_name, business_category, subdomain, logo_url, banner_url,
        is_open, delivery_time, delivery_fee, min_order_value, accepts_delivery, accepts_pickup,
        contact_phone, contact_email, social_instagram, social_facebook, social_whatsapp
      FROM commerces
      WHERE subdomain = $1
    `;
    const commerceResult = await pool.query(commerceQuery, [subdomain]);

    if (commerceResult.rows.length === 0) {
      console.log(`API: Comercio no encontrado para subdominio: ${subdomain}`);
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    const commerce = commerceResult.rows[0];
    console.log(`API: Comercio encontrado: ${commerce.business_name} (ID: ${commerce.id})`);

    // Obtener categorías y productos
    const categoriesQuery = `
      SELECT c.id, c.name,
        json_agg(json_build_object(
          'id', p.id,
          'name', p.name,
          'image_url', p.image_url,
          'description', p.description,
          'price', p.price
        )) FILTER (WHERE p.id IS NOT NULL) AS products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE c.commerce_id = $1
      GROUP BY c.id, c.name
    `;

    const categoriesResult = await pool.query(categoriesQuery, [commerce.id]);
    console.log(`API: Se encontraron ${categoriesResult.rows.length} categorías`);

    // Para cada categoría, si products es null, convertirlo en array vacío
    const categories = categoriesResult.rows.map(category => ({
      ...category,
      products: category.products || []
    }));

    res.json({
      commerce,
      categories,
    });
  } catch (error) {
    console.error('API: Error al obtener la carta:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;