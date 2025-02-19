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
app.use((req, res, next) => {
  const host = req.headers.host;
  const parts = host.split('.');
  req.tenant = (parts.length >= 3) ? parts[0] : 'default';
  console.log(`Tenant identificado: ${req.tenant}`);
  next();
});

// Ruta de prueba para verificar que el servidor funciona
app.get('/', (req, res) => {
  res.send('API funcionando');
});

// Rutas de autenticación (en /api/auth)
app.use('/api/auth', authRoutes);

// Montar el router en /api/commerces
app.use('/api/commerces', commerceRoutes);

// Poner el servidor a escuchar en el puerto especificado en .env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
