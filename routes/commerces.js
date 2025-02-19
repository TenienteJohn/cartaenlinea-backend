// routes/commerces.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// Usar el mismo Pool (o importar el que tengas configurado en otro módulo)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/commerces
 * Listar todos los comercios
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM commerces ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /commerces:', error);
    res.status(500).json({ error: 'Error al obtener comercios' });
  }
});

/**
 * POST /api/commerces
 * Crear un nuevo comercio
 */
router.post('/', async (req, res) => {
  const { subdomain, business_name } = req.body;
  try {
    const query = `
      INSERT INTO commerces (subdomain, business_name)
      VALUES ($1, $2)
      RETURNING *`;
    const values = [subdomain, business_name];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error en POST /commerces:', error);
    // Código 23505 = violación de restricción única (subdomain único)
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El subdominio ya existe. Elige otro.' });
    }
    res.status(500).json({ error: 'Error al crear el comercio' });
  }
});

/**
 * GET /api/commerces/:id
 * Obtener un comercio por ID
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'SELECT * FROM commerces WHERE id = $1';
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en GET /commerces/:id:', error);
    res.status(500).json({ error: 'Error al obtener el comercio' });
  }
});

/**
 * PUT /api/commerces/:id
 * Actualizar un comercio (subdominio y/o business_name)
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { subdomain, business_name } = req.body;

  try {
    const query = `
      UPDATE commerces
      SET subdomain = $1,
          business_name = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *`;
    const values = [subdomain, business_name, id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en PUT /commerces/:id:', error);
    if (error.code === '23505') {
      // Subdominio duplicado
      return res.status(400).json({ error: 'El subdominio ya está en uso.' });
    }
    res.status(500).json({ error: 'Error al actualizar el comercio' });
  }
});

/**
 * DELETE /api/commerces/:id
 * Eliminar un comercio
 */
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const query = 'DELETE FROM commerces WHERE id = $1 RETURNING *';
    const values = [id];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }
    res.json({ message: 'Comercio eliminado', commerce: result.rows[0] });
  } catch (error) {
    console.error('Error en DELETE /commerces/:id:', error);
    res.status(500).json({ error: 'Error al eliminar el comercio' });
  }
});

module.exports = router;
