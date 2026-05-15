require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/appointments', require('./src/routes/appointments'));
app.use('/api/patients', require('./src/routes/patients'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/chat', require('./src/routes/chat'));

// Init database — call once after deploy
app.post('/api/init', async (req, res) => {
  try {
    const { init } = require('./init-supabase');
    await init();
    res.json({ success: true, message: 'Database initialized' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(express.static(path.join(__dirname, 'frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 PsyCalm running on port ${PORT}`);
});
