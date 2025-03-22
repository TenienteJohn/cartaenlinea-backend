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

    // Consulta actualizada para incluir etiquetas
    const categoriesQuery = `
      SELECT c.id, c.name, c.position,
        json_agg(
          json_build_object(
            'id', p.id,
            'name', p.name,
            'image_url', p.image_url,
            'description', p.description,
            'price', p.price,
            'tags', (
              SELECT json_agg(
                json_build_object(
                  'id', t.id,
                  'name', t.name,
                  'color', t.color,
                  'textColor', t.text_color,
                  'discount', t.discount,
                  'isRecommended', t.is_recommended,
                  'priority', t.priority
                )
              )
              FROM tags t
              JOIN product_tags pt ON t.id = pt.tag_id
              WHERE pt.product_id = p.id AND t.visible = true
            ),
            'options', (
              SELECT json_agg(
                json_build_object(
                  'id', po.id,
                  'name', po.name,
                  'required', po.required,
                  'multiple', po.multiple,
                  'max_selections', po.max_selections,
                  'tags', (
                    SELECT json_agg(
                      json_build_object(
                        'id', t.id,
                        'name', t.name,
                        'color', t.color,
                        'textColor', t.text_color,
                        'discount', t.discount,
                        'isRecommended', t.is_recommended,
                        'priority', t.priority
                      )
                    )
                    FROM tags t
                    JOIN option_tags ot ON t.id = ot.tag_id
                    WHERE ot.option_id = po.id AND t.visible = true
                  ),
                  'items', (
                    SELECT json_agg(
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
                              'discount', t.discount,
                              'disableSelection', t.disable_selection,
                              'isRecommended', t.is_recommended,
                              'priority', t.priority
                            )
                          )
                          FROM tags t
                          JOIN item_tags it ON t.id = it.tag_id
                          WHERE it.item_id = oi.id AND t.visible = true
                        )
                      )
                    )
                    FROM option_items oi
                    WHERE oi.option_id = po.id AND oi.available = true
                  )
                )
              )
              FROM product_options po
              WHERE po.product_id = p.id
            )
          )
        ) FILTER (WHERE p.id IS NOT NULL) AS products
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      WHERE c.commerce_id = $1
      GROUP BY c.id, c.name, c.position
      ORDER BY c.position, c.id
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