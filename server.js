require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { router: authRouter, requireAuth, verifyToken } = require('./src/routes/auth');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());

// Stripe webhook MUST be before express.json() to receive raw body
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), require('./src/routes/webhook-stripe'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Auth routes (public)
app.use('/api/auth', authRouter);

// Public API routes
app.use('/api/chat', require('./src/routes/chat'));

// API routes (public for dashboard functionality)
app.use('/api/appointments', require('./src/routes/appointments'));
app.use('/api/patients', require('./src/routes/patients'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/dashboard', require('./src/routes/dashboard'));

// Public booking & payment APIs
app.use('/api/availability', require('./src/routes/availability'));
app.use('/api/bookings', require('./src/routes/bookings'));
app.use('/api/checkout', require('./src/routes/checkout'));

// Init database — call once after deploy
async function initHandler(req, res) {
  try {
    const { init } = require('./init-supabase');
    await init();
    res.json({ success: true, message: 'Database initialized' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
app.post('/api/init', initHandler);
app.get('/api/init', initHandler);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth middleware for frontend
function checkAuth(req, res, next) {
  const token = req.headers.cookie?.match(/token=([^;]+)/)?.[1] || req.headers.authorization?.replace('Bearer ', '');
  if (token && verifyToken(token)) {
    return next();
  }
  // Redirect to login for HTML requests
  if (req.headers.accept?.includes('text/html')) {
    return res.redirect('/login');
  }
  res.status(401).json({ success: false, error: 'No autenticado' });
}

// Serve login page (public)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'login.html'));
});

// Public chat page for patients
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public.html'));
});

// Public booking page for patients
app.get('/agendar', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'agendar.html'));
});

// Payment result pages
app.get('/pago-exitoso', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'pago-exitoso.html'));
});
app.get('/pago-cancelado', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'pago-cancelado.html'));
});

// Serve static assets (public — needed for login page css/js if any)
app.use('/brand.css', express.static(path.join(__dirname, 'frontend', 'brand.css')));
app.use('/assets', express.static(path.join(__dirname, 'frontend', 'assets')));

// Protected dashboard — serve React app only if authenticated
app.get('/', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Aparta running on port ${PORT}`);
});
