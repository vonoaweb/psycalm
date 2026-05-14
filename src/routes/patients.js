const express = require('express');
const { query, queryOne } = require('../config/database');
const router = express.Router();

// GET /api/patients
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM patients WHERE 1=1';
    const params = [];
    let pIdx = 1;

    if (req.query.status) {
      sql += ` AND status = $${pIdx++}`;
      params.push(req.query.status);
    }
    if (req.query.search) {
      sql += ` AND (name ILIKE $${pIdx++} OR email ILIKE $${pIdx++} OR phone ILIKE $${pIdx++})`;
      const term = `%${req.query.search}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY name ASC';

    const result = await query(sql, params);
    res.json({ success: true, count: result.data.length, data: result.data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/patients
router.post('/', async (req, res) => {
  try {
    const { name, phone, email, notes, status } = req.body;
    const result = await query(
      'INSERT INTO patients (name, phone, email, notes, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, phone, email, notes, status || 'active']
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/patients/:id
router.put('/:id', async (req, res) => {
  try {
    const { name, phone, email, notes, status } = req.body;
    const result = await query(
      'UPDATE patients SET name = $1, phone = $2, email = $3, notes = $4, status = $5 WHERE id = $6 RETURNING *',
      [name, phone, email, notes, status, req.params.id]
    );
    res.json({ success: true, data: result.data[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
