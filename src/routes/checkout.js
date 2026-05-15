const express = require('express');
const { stripe } = require('../config/stripe');
const router = express.Router();

// POST /api/checkout/session
// Body: { appointment_id, patient_name, deposit_amount, fee, type_label, date, time }
router.post('/session', async (req, res) => {
  try {
    const { appointment_id, patient_name, deposit_amount, fee, type_label, date, time } = req.body;

    if (!appointment_id || !deposit_amount) {
      return res.status(400).json({ success: false, error: 'appointment_id y deposit_amount son requeridos' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'mxn',
          product_data: {
            name: `Anticipo - ${type_label || 'Cita'}`,
            description: `Cita: ${date || ''} ${time || ''}`
          },
          unit_amount: Math.round(deposit_amount * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&appointment=${appointment_id}`,
      cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado?appointment=${appointment_id}`,
      metadata: {
        appointment_id: String(appointment_id),
        patient_phone: req.body.patient_phone || '',
        type: req.body.type || ''
      }
    });

    res.json({ success: true, url: session.url, session_id: session.id });
  } catch (err) {
    console.error('Checkout session error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/checkout/verify?session_id=xxx
// Verifies a Stripe session directly (useful when webhook is not yet configured)
router.get('/verify', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) {
      return res.status(400).json({ success: false, error: 'session_id requerido' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const appointmentId = session.metadata?.appointment_id;

    if (session.payment_status === 'paid' && appointmentId && appointmentId !== 'temp') {
      // Auto-confirm appointment if webhook missed it
      const { supabase } = require('../config/supabase');
      await supabase.from('appointments')
        .update({ status: 'confirmed', paid: true, payment_method: 'stripe' })
        .eq('id', appointmentId);

      // Record payment if not already recorded
      try {
        await supabase.from('payments').insert({
          appointment_id: appointmentId,
          patient_name: session.customer_details?.name || 'Paciente',
          amount: session.amount_total / 100,
          deposit_amount: session.amount_total / 100,
          stripe_session_id: session.id,
          status: 'completed',
          method: 'stripe'
        });
      } catch (e) {
        // Payment may already exist, ignore duplicate
      }

      return res.json({ success: true, paid: true, appointment_id: appointmentId });
    }

    res.json({ success: true, paid: false, status: session.payment_status });
  } catch (err) {
    console.error('Verify session error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
