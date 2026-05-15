// ============================================
// APARTA — Autenticación
// ============================================

const express = require('express');
const crypto = require('crypto');
const { query } = require('../config/database');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'aparta-dev-secret-change-in-production';
const SALT = 'aparta-salt-2026';

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + SALT).digest('hex');
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email y contraseña requeridos' });
    }

    const result = await query('SELECT * FROM admins WHERE email = $1 AND is_active = true', [email]);
    if (!result.data || result.data.length === 0) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const admin = result.data[0];
    const hashedInput = hashPassword(password);

    if (hashedInput !== admin.password_hash) {
      return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
    }

    const token = signToken({ id: admin.id, email: admin.email, name: admin.full_name });

    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);

    res.json({ success: true, token, user: { id: admin.id, email: admin.email, name: admin.full_name } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, error: 'Error del servidor' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0');
  res.json({ success: true, message: 'Sesión cerrada' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const token = parseCookies(req).token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'No autenticado' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ success: false, error: 'Token inválido' });

  res.json({ success: true, user: { id: payload.id, email: payload.email, name: payload.name } });
});

// Middleware para proteger rutas
function requireAuth(req, res, next) {
  const token = parseCookies(req).token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, error: 'No autenticado' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Token inválido' });
  }

  req.user = payload;
  next();
}

module.exports = { router, requireAuth, verifyToken };
