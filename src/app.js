// Agregar manejadores globales de errores para capturar excepciones no manejadas
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

const fs = require('fs');
const path = require('path');

// Importar dependencias
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

// Inicializar la aplicación Express
const app = express();

// Configurar middlewares
app.use(express.json());

// Configurar CORS para permitir solo desde http://localhost:3000
const corsOptions = {
  origin: "http://localhost:3000",
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Forzar que la cadena de conexión incluya sslmode=require
let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes('sslmode=require')) {
  connectionString += connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require';
}

// Leer el certificado CA desde la carpeta 'certs' en la raíz de la app.
// Ajusta la ruta según la ubicación de app.js.
// Este ejemplo asume que app.js está en "src/" y la carpeta certs en la raíz.
// Leer la cadena de certificados (CA) desde el archivo en la carpeta 'certs'
let caCert;
try {
  caCert = fs.readFileSync(path.join(__dirname, '..', 'certs', 'DigiCertChain.pem')).toString();
  console.log('Cadena de certificados (CA) leída correctamente:');
  console.log(caCert.substring(0, 100) + '...'); // Muestra los primeros 100 caracteres para confirmar
} catch (err) {
  console.error('Error al leer la cadena de certificados CA. Verifica que la carpeta "certs" y el archivo "DigiCertChain.pem" existan:', err);
  process.exit(1);
}

// Configurar la conexión a PostgreSQL usando SSL validado
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    require: true,               // Fuerza el uso de SSL
    rejectUnauthorized: false,    // Verifica el certificado
    ca: caCert,                  // Certificado raíz para la verificación
  },
});

// Probar la conexión a la base de datos
pool.connect()
  .then(() => console.log('Conexión a PostgreSQL establecida correctamente'))
  .catch(err => {
    console.error('Error al conectar a PostgreSQL:', err);
    process.exit(1);
});

// Middleware para extraer el subdominio (tenant)
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


