const express = require('express');
const { query } = require('../config/database');
const router = express.Router();

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT key, value FROM settings');
    const settings = {};
    result.data.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      await query(
        'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [key, JSON.stringify(value)]
      );
    }
    res.json({ success: true, message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/fee-types
router.get('/fee-types', async (req, res) => {
  try {
    const result = await query('SELECT * FROM fee_types ORDER BY id ASC');
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings/fee-types/:id
router.put('/fee-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { fee, deposit_percent, duration, label } = req.body;
    await query(
      'UPDATE fee_types SET fee = $1, deposit_percent = $2, duration = $3, label = $4 WHERE id = $5',
      [fee, deposit_percent, duration, label, id]
    );
    res.json({ success: true, message: 'Tarifa actualizada con éxito' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
