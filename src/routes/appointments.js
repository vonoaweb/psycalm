const express = require('express');
const { query, queryOne } = require('../config/database');
const router = express.Router();

// GET /api/appointments
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM appointments WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (req.query.date) {
      sql += ` AND date = $${pIdx++}`;
      params.push(req.query.date);
    }
    if (req.query.status) {
      sql += ` AND status = $${pIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.patient_id) {
      sql += ` AND patient_id = $${pIdx++}`;
      params.push(req.query.patient_id);
    }
    if (req.query.month) {
      const [year, month] = req.query.month.split('-');
      sql += ` AND date >= $${pIdx++} AND date < $${pIdx++}`;
      params.push(`${year}-${month}-01`);
      params.push(`${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`);
    }

    sql += ' ORDER BY date ASC, time ASC';

    const result = await query(sql, params);
    res.json({ success: true, count: result.data.length, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/appointments/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await queryOne('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (!result.data) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/appointments
router.post('/', async (req, res) => {
  try {
    const { patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, notes, duration } = req.body;
    const result = await query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, notes, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [patient_name, patient_phone, patient_email, date, time, type, status || 'pending', fee, deposit_percent || 20, deposit_amount || Math.round(fee * (deposit_percent || 20) / 100), notes, duration || 60]
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/appointments/:id
router.put('/:id', async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(req.body[key]);
      }
    });

    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    values.push(req.params.id);
    const result = await query(
      `UPDATE appointments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/appointments/:id (cancel)
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      "UPDATE appointments SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
