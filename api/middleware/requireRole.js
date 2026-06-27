import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[FATAL] JWT_SECRET is not set. Set it in your environment before starting.');
  process.exit(1);
}

const _secret = JWT_SECRET || 'change-me-in-production-set-JWT_SECRET-env';

/**
 * requireRole(...roles) — Express middleware factory.
 * Verifies the Bearer JWT and checks that payload.role is in the allowed set.
 *
 * Usage:
 *   router.get('/admin-only', requireRole('admin'), handler)
 *   router.post('/pharmacy-upload', requireRole('admin', 'pharmacy'), handler)
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      return res.status(401).json({ error: { message: 'נדרשת הזדהות.' } });
    }

    let payload;
    try {
      payload = jwt.verify(token, _secret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError'
        ? 'פג תוקף ההתחברות — יש להתחבר מחדש.'
        : 'אסימון לא תקין.';
      return res.status(401).json({ error: { message: msg } });
    }

    if (!roles.includes(payload.role)) {
      return res.status(403).json({
        error: { message: 'אין לך הרשאה לבצע פעולה זו.', required: roles },
      });
    }

    req.userId = payload.sub;
    req.role   = payload.role;
    next();
  };
}

/**
 * verifyAnyUser — lighter guard: validates JWT but does NOT check role.
 * Equivalent to the existing verifySession in claudeProxyShield.js.
 * Prefer using that existing helper for non-admin routes.
 */
export function verifyAnyUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: { message: 'נדרשת הזדהות.' } });
  }

  try {
    const payload = jwt.verify(token, _secret);
    req.userId = payload.sub;
    req.role   = payload.role ?? 'user';
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'פג תוקף ההתחברות — יש להתחבר מחדש.'
      : 'אסימון לא תקין.';
    res.status(401).json({ error: { message: msg } });
  }
}
