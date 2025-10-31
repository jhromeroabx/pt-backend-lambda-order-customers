const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Bearer token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    console.error('JWT verification failed:', e); // Log the error for debugging
    return res.status(401).json({ error: 'Invalid token', details: e.message });
  }
}

function internalAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token || token !== process.env.SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized (service token)' });
  }
  return next();
}

module.exports = { authMiddleware, internalAuth };
