import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH;
const TOKEN_TTL = '30d';

// Verify the owner password against the bcrypt hash from the environment.
export async function verifyOwnerPassword(password) {
  if (!OWNER_PASSWORD_HASH) return false;
  return bcrypt.compare(password ?? '', OWNER_PASSWORD_HASH);
}

export function issueOwnerToken() {
  return jwt.sign({ role: 'owner' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Express middleware: rejects the request unless a valid owner JWT is present.
// Read endpoints stay public; only mutations are guarded by this.
export function requireOwner(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'owner') throw new Error('wrong role');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}
