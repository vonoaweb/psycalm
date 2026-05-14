const express = require('express');
const { query } = require('../config/database');
const router = express.Router();

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    const todayApts = await query("SELECT COUNT(*) as count FROM appointments WHERE date = $1", [today]);
    const activePts = await query("SELECT COUNT(*) as count FROM patients WHERE status = 'active'");
    const monthlyIncome = await query("SELECT COALESCE(SUM(deposit_amount), 0) as total FROM payments WHERE date >= $1 AND status = 'completed'", [monthStart]);
    const pendingDeps = await query("SELECT COALESCE(SUM(deposit_amount), 0) as total FROM appointments WHERE status = 'pending' AND paid = false");
    const recentApts = await query("SELECT * FROM appointments ORDER BY created_at DESC LIMIT 5");

    res.json({
      success: true,
      data: {
        todayAppointments: parseInt(todayApts.data[0]?.count) || 0,
        activePatients: parseInt(activePts.data[0]?.count) || 0,
        monthlyIncome: parseFloat(monthlyIncome.data[0]?.total) || 0,
        pendingDeposits: parseFloat(pendingDeps.data[0]?.total) || 0,
        recentAppointments: recentApts.data
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
