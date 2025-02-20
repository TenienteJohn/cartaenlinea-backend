// routes/products.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Ejemplo de endpoint para crear un producto
router.post('/', async (req, res) => {
  try {
    // Datos del body
    const { name, price, category_id } = req.body;
    // Como en categories, revisa req.user.role y req.user.commerceId si lo deseas
    // ...
    res.json({ message: 'Producto creado (placeholder)' });
  } catch (error) {
    console.error('Error en /api/products [POST]', error);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Endpoint mínimo para GET /api/products
router.get('/', (req, res) => {
  // Como prueba, devuelve un arreglo vacío o algún mensaje
  res.json({ message: "Listado de productos (endpoint de prueba)" });
});


// Exportar router
module.exports = router;
