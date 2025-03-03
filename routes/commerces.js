const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middlewares/authMiddleware'); // Middleware de autenticación

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * GET /api/commerces
 * Listar todos los comercios (solo accesible para el superusuario)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Verificar si el usuario es SUPERUSER
    if (req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No tienes permisos para acceder a esta información' });
    }
    const result = await pool.query('SELECT * FROM commerces ORDER BY id ASC');
    res.json(result.rows);
  } catch (error) {
    console.error('Error en GET /commerces:', error);
    res.status(500).json({ error: 'Error al obtener comercios' });
  }
});

/**
 * PUT /api/commerces/:id/update-logo
 * Permite actualizar la URL del logo de un comercio
 * Solo accesible para el superusuario
 */
router.put('/:id/update-logo', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { logoUrl } = req.body;

  // Verificar si el usuario es SUPERUSER
  if (req.user.role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'No tienes permisos para actualizar el logo' });
  }

  if (!logoUrl) {
    return res.status(400).json({ error: 'Falta la URL de la imagen' });
  }

  try {
    const query = `
      UPDATE commerces
      SET logo_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *`;
    const result = await pool.query(query, [logoUrl, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    res.json({ message: 'Logo actualizado correctamente', commerce: result.rows[0] });
  } catch (error) {
    console.error('Error en PUT /commerces/:id/update-logo:', error);
    res.status(500).json({ error: 'Error al actualizar el logo' });
  }
});

/**
 * POST /api/commerces
 * Crear un nuevo comercio (solo superusuario)
 */
router.post('/', authMiddleware, async (req, res) => {
  const { subdomain, business_name } = req.body;
  try {
    // Verificar si el usuario es SUPERUSER
    if (req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No tienes permisos para crear comercios' });
    }
    const query = `
      INSERT INTO commerces (subdomain, business_name)
      VALUES ($1, $2)
      RETURNING *`;
    const values = [subdomain, business_name];
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error en POST /commerces:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El subdominio ya existe. Elige otro.' });
    }
    res.status(500).json({ error: 'Error al crear el comercio' });
  }
});

module.exports = router;

