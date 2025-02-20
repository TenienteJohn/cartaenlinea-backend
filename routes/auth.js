// routes/auth.js

// 1. Importar las dependencias necesarias
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// 2. Crear la instancia de Pool para conectarnos a PostgreSQL
//    (Si prefieres reutilizar un Pool definido en otro archivo, puedes importarlo aquí).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 3. Ruta de prueba para verificar que el router funciona correctamente
router.get('/', (req, res) => {
  res.json({ message: 'Auth router funcionando correctamente' });
});

/**
 * Helper: Decodificar token (si existe) para saber quién está registrando al nuevo usuario.
 * Retorna null si no hay token o si no es válido.
 */
async function decodeTokenIfExists(req) {
  const header = req.headers.authorization;
  if (!header) return null;

  // El header suele ser "Bearer <token>"
  const token = header.split(' ')[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded; // Ej: { userId, role, commerceId, iat, exp }
  } catch (error) {
    console.error('Error al verificar token en /register:', error);
    return null;
  }
}

/**
 * 4. Endpoint para registrar un nuevo usuario
 * 
 * - Si NO hay token o el usuario logueado NO es SUPERUSER, forzamos role='OWNER' y commerce_id=NULL.
 * - Si quien registra ES SUPERUSER, puede asignar role y commerce_id en el body.
 */
router.post('/register', async (req, res) => {
  try {
    // Extraer campos del body
    const { email, password, role, commerce_id } = req.body;

    // 4.1 Verificar si el usuario ya existe
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // 4.2 Verificar quién hace la petición (SUPERUSER o no)
    const decoded = await decodeTokenIfExists(req);  // null si no hay token o token inválido

    let finalRole = 'OWNER';
    let finalCommerceId = null;

    if (decoded && decoded.role === 'SUPERUSER') {
      // El usuario que crea ES SUPERUSER, puede asignar un role y commerce_id personalizados
      // Si no manda role, por defecto 'OWNER'
      finalRole = role || 'OWNER';
      // Si no manda commerce_id, por defecto null
      finalCommerceId = commerce_id || null;
    } else {
      // OJO: Si un usuario normal (o sin token) intenta poner role=SUPERUSER, se ignora
      // Podrías devolver un 403 si se intenta pasar role, en lugar de forzar
      if (role && role.toUpperCase() !== 'OWNER') {
        return res.status(403).json({
          error: 'Solo un SUPERUSER puede asignar roles distintos de OWNER',
        });
      }
    }

    // 4.3 Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4.4 Insertar el nuevo usuario
    const query = `
      INSERT INTO users (email, password, role, commerce_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, role, commerce_id
    `;
    const values = [email, hashedPassword, finalRole, finalCommerceId];

    const newUser = await pool.query(query, values);

    return res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: newUser.rows[0],
    });

  } catch (error) {
    console.error('Error en /register:', error);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

/**
 * 5. Endpoint para iniciar sesión
 *    - Genera un token que incluye: userId, role, commerce_id
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscar al usuario por email
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    // Comparar la contraseña ingresada con la almacenada
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    // Generar un token JWT con role y commerce_id
    const payload = {
      userId: user.id,
      role: user.role,            // 'SUPERUSER' o 'OWNER'
      commerceId: user.commerce_id // Puede ser null o el id del comercio
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    return res.json({ message: 'Inicio de sesión exitoso', token });
  } catch (error) {
    console.error('Error en /login:', error);
    return res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 6. Exportar el router para usarlo en app.js
module.exports = router;

