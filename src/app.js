// Cargar las variables de entorno
require('dotenv').config({ path: __dirname + '/.env' });
console.log('DATABASE_URL:', process.env.DATABASE_URL);

// Importar dependencias
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Importar el router de autenticación (subiendo un nivel con ../)
const authRoutes = require('../routes/auth');

// Importar nuestro router de comercios
const commerceRoutes = require('../routes/commerces');

// Importar tu middleware de autenticación
const authMiddleware = require('../middlewares/authMiddleware');

// Importar tus routers
const categoriesRouter = require('../routes/categories');
const productsRouter = require('../routes/products');

// En app.js, después de configurar otras rutas
const uploadRoutes = require('../routes/upload');

// Inicializar la aplicación Express
const app = express();

// Configurar middlewares
app.use(express.json()); // Para parsear JSON en las peticiones
app.use(cors());         // Para habilitar CORS

// Conexión a PostgreSQL usando la librería 'pg'
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Probar la conexión a la base de datos
pool.connect()
  .then(() => console.log('Conexión a PostgreSQL establecida correctamente'))
  .catch(err => console.error('Error al conectar a PostgreSQL:', err));

// Middleware para extraer el subdominio (tenant) de la solicitud
// <-- Este middleware detecta el subdominio desde req.headers.host
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  // Si el host tiene al menos 3 partes, tomamos la primera como subdominio
  req.tenant = (parts.length >= 3) ? parts[0] : 'default';
  console.log(`Tenant identificado: ${req.tenant}`);
  next();
});

// Ruta de prueba para verificar que el servidor funciona
// <-- Útil para comprobar rápidamente si la API está respondiendo
app.get('/', (req, res) => {
  res.send('API funcionando');
});

// Rutas de autenticación (en /api/auth)
// <-- Estas rutas son públicas: login, register, etc.
app.use('/api/auth', authRoutes);

// Montar el router en /api/commerces
// <-- El superusuario puede crear/editar/borrar comercios aquí
app.use('/api/commerces', commerceRoutes);

// Rutas protegidas: se aplica authMiddleware antes de entrar al router
// <-- Cualquier ruta /api/categories o /api/products requiere un token JWT válido.
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/products', authMiddleware, productsRouter);

// Monta el endpoint de subida
app.use('/api/upload', uploadRoutes);

// Poner el servidor a escuchar en el puerto especificado en .env
// <-- Iniciamos la aplicación con node app.js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
