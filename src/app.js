// src/app.js

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// Cargar las variables de entorno
require("dotenv").config({ path: __dirname + "/.env" });
console.log("DATABASE_URL:", process.env.DATABASE_URL);

// Importar dependencias
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

// Importar routers y middlewares
const authRoutes = require("../routes/auth");
const commerceRoutes = require("../routes/commerces");
const authMiddleware = require("../middlewares/authMiddleware");
const categoriesRouter = require("../routes/categories");
const productsRouter = require("../routes/products");
const publicRoutes = require("../routes/public"); // Importar las rutas públicas

// Inicializar la aplicación Express
const app = express();

// Configurar middlewares
app.use(express.json());

// Configurar CORS para permitir subdominios de localhost y otros orígenes permitidos
const corsOptions = {
  origin: function(origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "https://cartaenlinea-67dbc62791d3.herokuapp.com"
    ];

    // Permitir subdominios de localhost, el origen original, o sin origen (para herramientas como Postman)
    if (!origin || origin.includes('localhost:3000') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Forzar que la cadena de conexión incluya sslmode=require
let connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.includes("sslmode=require")) {
  connectionString += connectionString.includes("?") ? "&sslmode=require" : "?sslmode=require";
}

// Conexión a PostgreSQL
const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

// Probar la conexión a la base de datos
pool.connect()
  .then(() => console.log("✅ Conexión a PostgreSQL establecida correctamente"))
  .catch((err) => console.error("❌ Error al conectar a PostgreSQL:", err));

// Middleware para extraer el subdominio (tenant)
app.use((req, res, next) => {
  const host = req.headers.host || "";
  const parts = host.split(".");
  req.tenant = parts.length >= 3 ? parts[0] : "default";
  console.log(`🔹 Tenant identificado: ${req.tenant}`);
  next();
});

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("🚀 API funcionando");
});

// ✅ Rutas organizadas
app.use("/api/auth", authRoutes);
app.use("/api/commerces", authMiddleware, commerceRoutes);
app.use("/api/categories", authMiddleware, categoriesRouter);
app.use("/api/products", authMiddleware, productsRouter);
app.use("/api/public", publicRoutes); // Registrar las rutas públicas

// Listar endpoints disponibles en la API
const expressListEndpoints = require("express-list-endpoints");
console.log("📌 Rutas cargadas en Express:");
console.log(expressListEndpoints(app));

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});



