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

/**
 * POST /api/commerces/:id/assign-owner
 * Asigna un usuario Owner a un comercio con credenciales de acceso.
 */
router.post('/:id/assign-owner', authMiddleware, async (req, res) => {
  const { id } = req.params; // ID del comercio
  const { email, password } = req.body; // Datos del owner

  try {
    // Verificar si el usuario es SUPERUSER
    if (req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No tienes permisos para asignar un Owner' });
    }

    // Verificar si el comercio existe
    const commerceCheck = await pool.query('SELECT * FROM commerces WHERE id = $1', [id]);
    if (commerceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    // Verificar si el email ya está en uso
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // Encriptar la contraseña antes de guardarla
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar el nuevo usuario como OWNER del comercio
    const query = `
      INSERT INTO users (email, password, role, commerce_id)
      VALUES ($1, $2, 'OWNER', $3)
      RETURNING id, email, role, commerce_id
    `;
    const values = [email, hashedPassword, id];
    const newUser = await pool.query(query, values);

    res.status(201).json({
      message: 'Owner asignado exitosamente',
      user: newUser.rows[0]
    });

  } catch (error) {
    console.error('Error en /assign-owner:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

/**
 * PUT /api/commerces/:id/assign-subdomain
 * Permite al superusuario modificar el subdominio de un comercio.
 */
router.put('/:id/assign-subdomain', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { subdomain } = req.body;

  try {
    // Verificar si el usuario es SUPERUSER
    if (req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No tienes permisos para modificar el subdominio' });
    }

    // Verificar si el comercio existe
    const commerceCheck = await pool.query('SELECT * FROM commerces WHERE id = $1', [id]);
    if (commerceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comercio no encontrado' });
    }

    // Verificar si el subdominio ya está en uso
    const subdomainCheck = await pool.query('SELECT * FROM commerces WHERE subdomain = $1', [subdomain]);
    if (subdomainCheck.rows.length > 0) {
      return res.status(400).json({ error: 'El subdominio ya está en uso, elige otro.' });
    }

    // Actualizar el subdominio en la base de datos
    const query = `
      UPDATE commerces
      SET subdomain = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const values = [subdomain, id];
    const updatedCommerce = await pool.query(query, values);

    res.json({
      message: 'Subdominio actualizado correctamente',
      commerce: updatedCommerce.rows[0]
    });

  } catch (error) {
    console.error('Error en /assign-subdomain:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

/**
 * DELETE /api/commerces/:id
 * Eliminar un comercio (solo superusuario)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    // Verificar si el usuario es SUPERUSER
    if (req.user.role !== 'SUPERUSER') {
      return res.status(403).json({ error: 'No tienes permisos para eliminar comercios' });
    }

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
