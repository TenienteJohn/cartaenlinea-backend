// middlewares/authMiddleware.js

const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación:
 * - Lee el header "Authorization: Bearer <token>"
 * - Verifica y decodifica el token con jwt.verify()
 * - Si es válido, asigna los datos a req.user (ej. { userId, role, commerceId })
 * - Si no hay token o es inválido, responde con 401
 */
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  
  if (!header) {
    // No se envió el header Authorization
    return res.status(401).json({ error: 'No token provided' });
  }

  // Asumimos formato "Bearer <token>"
  const token = header.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    // Decodificar el token usando la clave secreta
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded debe contener { userId, role, commerceId, iat, exp }
    
    // Asignamos la info del usuario a req.user
    req.user = decoded;
    
    // Continuar al siguiente middleware o ruta
    next();
  } catch (error) {
    console.error('JWT error:', error);
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

module.exports = authMiddleware;
