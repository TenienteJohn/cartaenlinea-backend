// Manejadore globales de errores para capturar excepciones no manejadas
process.on('uncaughtException', (err) => {
  console.error('Unhandled Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Cargar las variables de entorno
require('dotenv').config({ path: __dirname + '/.env' });
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

// Importar routers y middlewares
const authRoutes = require('../routes/auth');
const commerceRoutes = require('../routes/commerces');
const authMiddleware = require('../middlewares/authMiddleware');
const categoriesRouter = require('../routes/categories');
const productsRouter = require('../routes/products');
const uploadRoutes = require('../routes/upload');

const app = express();

// Configurar middlewares
app.use(express.json());

// Configurar CORS para permitir solicitudes solo desde http://localhost:3000
const corsOptions = {
  origin: "http://localhost:3000",
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Forzar que la cadena de conexión incluya sslmode=require (por si acaso)
let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=require')) {
  connectionString += connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require';
}

// Configuración de conexión a PostgreSQL para entornos Heroku Standard
// (Nota: Este enfoque cifra la conexión pero no verifica la cadena de certificados,
// lo que es común en entornos estándar de Heroku)
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
});

// Probar la conexión a la base de datos
pool.connect()
  .then(() => console.log('Conexión a PostgreSQL establecida correctamente'))
  .catch(err => {
    console.error('Error al conectar a PostgreSQL:', err);
    process.exit(1);
  });

// Middleware para extraer el subdominio (tenant) de la solicitud
app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  req.tenant = (parts.length >= 3) ? parts[0] : 'default';
  console.log(`Tenant identificado: ${req.tenant}`);
  next();
});

// Ruta de prueba para verificar que el servidor funciona
app.get('/', (req, res) => {
  res.send('API funcionando');
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/commerces', commerceRoutes);
app.use('/api/categories', authMiddleware, categoriesRouter);
app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/upload', uploadRoutes);

const expressListEndpoints = require("express-list-endpoints");
console.log("📌 Rutas cargadas en Express:");
console.log(expressListEndpoints(app));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
