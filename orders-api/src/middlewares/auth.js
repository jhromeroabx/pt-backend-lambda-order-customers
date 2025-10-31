const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Bearer token' });
  // node -e "console.log(require('jsonwebtoken').sign({ user: 'test' }, 'supersecret', { expiresIn: '1h' }))"
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    console.error('Token verification failed:', e.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { authMiddleware };
