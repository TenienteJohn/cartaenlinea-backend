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
require('dotenv').config({ path: __dirname + '/.env' });
console.log('DATABASE_URL:', process.env.DATABASE_URL);

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const authRoutes = require('../routes/auth');
const commerceRoutes = require('../routes/commerces');
const authMiddleware = require('../middlewares/authMiddleware');
const categoriesRouter = require('../routes/categories');
const productsRouter = require('../routes/products');
const uploadRoutes = require('../routes/upload');

const app = express();
app.use(express.json());

const corsOptions = {
  origin: "http://localhost:3000",
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Ajuste de la cadena de conexión para asegurarnos que incluya sslmode=no-verify
let connectionString = process.env.DATABASE_URL;
connectionString = connectionString.replace(/(&|\?)sslmode=[^&]+/, '');
connectionString += connectionString.includes('?') ? '&sslmode=no-verify' : '?sslmode=no-verify';
console.log("Cadena de conexión ajustada:", connectionString);

// Configuración del Pool sin objeto ssl explícito, para que se use PGSSLMODE
const pool = new Pool({
  connectionString: connectionString
});

pool.connect()
  .then(() => console.log('Conexión a PostgreSQL establecida correctamente'))
  .catch(err => {
    console.error('Error al conectar a PostgreSQL:', err);
    process.exit(1);
  });

app.use((req, res, next) => {
  const host = req.headers.host || '';
  const parts = host.split('.');
  req.tenant = (parts.length >= 3) ? parts[0] : 'default';
  console.log(`Tenant identificado: ${req.tenant}`);
  next();
});

app.get('/', (req, res) => {
  res.send('API funcionando');
});

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
