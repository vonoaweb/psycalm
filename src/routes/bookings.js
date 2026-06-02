const express = require('express');
const { query, queryOne } = require('../config/database');
const { calcomClient } = require('../config/calcom');
const { stripe } = require('../config/stripe');
const router = express.Router();

const VALID_COUPONS = {
  'NANO50': { type: 'percent', value: 50 },
  'BANANA20': { type: 'percent', value: 20 },
  'NANO100': { type: 'fixed', value: 100 }
};

// GET /api/bookings/validate-coupon
router.get('/validate-coupon', (req, res) => {
  const code = String(req.query.code || '').toUpperCase().trim();
  if (VALID_COUPONS[code]) {
    return res.json({ success: true, coupon: VALID_COUPONS[code] });
  }
  res.json({ success: false, error: 'Cupón inválido o expirado' });
});

// POST /api/bookings
// Full public booking flow: create appointment + Cal.com + Stripe
router.post('/', async (req, res) => {
  try {
    const { patient_name, patient_phone, patient_email, date, time, type, fee, deposit_percent, notes, duration, coupon } = req.body;

    if (!patient_name || !date || !time || !type) {
      return res.status(400).json({ success: false, error: 'Nombre, fecha, hora y tipo son requeridos' });
    }

    let feeNum = parseFloat(fee) || 1200;
    const couponCode = String(coupon || '').toUpperCase().trim();
    let discountApplied = 0;

    if (couponCode && VALID_COUPONS[couponCode]) {
      const c = VALID_COUPONS[couponCode];
      if (c.type === 'percent') {
        discountApplied = Math.round(feeNum * c.value / 100);
      } else if (c.type === 'fixed') {
        discountApplied = c.value;
      }
      feeNum = Math.max(0, feeNum - discountApplied);
    }

    const depPct = parseInt(deposit_percent) || 20;
    const depAmount = Math.round(feeNum * depPct / 100);
    const dur = parseInt(duration) || 60;

    // 1. Create Cal.com booking
    let calcomBookingId = null;
    try {
      const calRes = await calcomClient.post('/bookings', {
        eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID),
        start: `${date}T${time}:00`,
        attendee: {
          name: patient_name,
          email: patient_email || `${patient_phone || 'paciente'}@temp.com`,
          timeZone: 'America/Mexico_City',
          phoneNumber: patient_phone || ''
        },
        metadata: { status: 'pending_payment', deposit: depAmount, coupon: couponCode || 'none' }
      });
      calcomBookingId = calRes.data?.data?.id || calRes.data?.id || null;
    } catch (err) {
      console.error('Cal.com booking error:', err.message);
      // Continue without Cal.com if it fails
    }

    // 2. Save appointment in our DB
    const aptResult = await query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, notes, duration, calcom_booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [patient_name, patient_phone, patient_email, date, time, type, 'pending', feeNum, depPct, depAmount, notes, dur, calcomBookingId]
    );
    const appointment = aptResult.data[0];

    // 3. Create Stripe Checkout Session
    let checkoutUrl = null;
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Anticipo - ${type}${couponCode ? ` (Cupón ${couponCode} aplicado)` : ''}`,
              description: `Cita: ${date} ${time}`
            },
            unit_amount: depAmount * 100
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&appointment=${appointment.id}`,
        cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado?appointment=${appointment.id}`,
        metadata: {
          appointment_id: String(appointment.id),
          patient_phone: patient_phone || '',
          type: type,
          coupon: couponCode || ''
        }
      });
      checkoutUrl = session.url;
    } catch (err) {
      console.error('Stripe session error:', err.message);
    }

    res.json({
      success: true,
      appointment,
      checkout_url: checkoutUrl,
      message: checkoutUrl
        ? 'Cita creada. Procedé a pagar el anticipo para confirmarla.'
        : 'Cita creada. Te contactaremos para el pago del anticipo.'
    });
  } catch (err) {
    console.error('Booking error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
