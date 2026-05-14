const express = require('express');
const { query } = require('../config/database');
const router = express.Router();

// GET /api/payments
router.get('/', async (req, res) => {
  try {
    const result = await query('SELECT * FROM payments ORDER BY date DESC');
    res.json({ success: true, count: result.data.length, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/payments (record a payment)
router.post('/', async (req, res) => {
  try {
    const { appointment_id, patient_name, amount, deposit_percent, deposit_amount, stripe_session_id, method } = req.body;
    const result = await query(
      'INSERT INTO payments (appointment_id, patient_name, amount, deposit_percent, deposit_amount, stripe_session_id, status, method) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [appointment_id, patient_name, amount, deposit_percent || 20, deposit_amount, stripe_session_id, 'completed', method || 'stripe']
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
