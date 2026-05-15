const express = require('express');
const { calcomClient } = require('../config/calcom');
const { query } = require('../config/database');
const router = express.Router();

// GET /api/availability?date=YYYY-MM-DD or ?days=14
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 14;
    const specificDate = req.query.date;
    const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;

    let slots = [];

    // Try Cal.com first
    if (eventTypeId) {
      try {
        const start = specificDate || new Date().toISOString().split('T')[0];
        const end = specificDate
          ? specificDate
          : new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

        const response = await calcomClient.get('/slots', {
          params: { eventTypeId, startTime: start, endTime: end }
        });

        const calSlots = response.data?.data?.slots || [];
        slots = calSlots.map(day => ({
          date: day.date || day.startTime?.split('T')[0],
          slots: (day.slots || []).map(s => typeof s === 'string' ? s : s.time).filter(Boolean)
        }));
      } catch (err) {
        console.error('Cal.com availability error:', err.message);
      }
    }

    // Fallback: generate slots from settings if Cal.com fails
    if (!slots.length) {
      for (let i = 1; i <= days; i++) {
        const d = new Date(Date.now() + i * 86400000);
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0) continue; // Skip Sundays
        slots.push({
          date: d.toISOString().split('T')[0],
          slots: ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00']
        });
      }
    }

    // Block already-booked slots from our DB
    const dateList = slots.map(s => s.date);
    if (dateList.length) {
      const placeholders = dateList.map((_, i) => `$${i + 1}`).join(',');
      const bookedResult = await query(
        `SELECT date, time FROM appointments WHERE date IN (${placeholders}) AND status IN ('pending', 'confirmed')`,
        dateList
      );
      const booked = bookedResult.data || [];

      slots = slots.map(day => ({
        date: day.date,
        slots: day.slots.filter(time => {
          const t = time.substring(0, 5);
          return !booked.some(b => b.date === day.date && b.time.substring(0, 5) === t);
        })
      })).filter(day => day.slots.length > 0);
    }

    res.json({ success: true, data: slots });
  } catch (err) {
    console.error('Availability error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
