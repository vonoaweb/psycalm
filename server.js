require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
  credentials: true
}));

// Stripe webhook MUST be BEFORE express.json() - needs raw body
app.use('/webhook/stripe', require('./src/routes/webhook-stripe'));

// Body parsing for other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/appointments', require('./src/routes/appointments'));
app.use('/api/patients', require('./src/routes/patients'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/chat', require('./src/routes/chat'));

// Webhook Routes
app.use('/webhook/whatsapp', require('./src/routes/webhook-whatsapp'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV || 'development' });
});

// Static frontend files (production)
app.use(express.static(path.join(__dirname, 'frontend')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Auto-initialize database on startup
async function initDatabase() {
  try {
    const { init } = require('./init-supabase');
    await init();
  } catch (err) {
    console.log('⚠️  Database init skipped (may already exist)');
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 PsyCalm running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔌 API: http://localhost:${PORT}/api`);
  console.log(`💬 Chat: http://localhost:${PORT}/api/chat/session`);

  // Try to init database
  await initDatabase();
});
