// routes/auth.js

// 1. Importar las dependencias necesarias
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// 2. Crear la instancia de Pool para conectarnos a PostgreSQL
//    (Si prefieres reutilizar un Pool definido en otro archivo, puedes importar ese Pool en lugar de crearlo aquí).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 3. Ruta de prueba para verificar que el router funciona correctamente
router.get('/', (req, res) => {
  res.json({ message: 'Auth router funcionando correctamente' });
});

// 4. Endpoint para registrar un nuevo usuario
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Verificar si el usuario ya existe
    const userExist = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar el nuevo usuario en la base de datos
    const newUser = await pool.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *',
      [email, hashedPassword]
    );

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user: newUser.rows[0],
    });
  } catch (error) {
    console.error('Error en /register:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 5. Endpoint para iniciar sesión
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

    // Generar un token JWT
    const payload = { userId: user.id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({ message: 'Inicio de sesión exitoso', token });
  } catch (error) {
    console.error('Error en /login:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// 6. Exportar el router para usarlo en app.js
module.exports = router;
