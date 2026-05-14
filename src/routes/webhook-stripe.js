const express = require('express');
const stripe = require('../config/stripe').stripe;
const { supabase } = require('../config/supabase');
const handlers = require('../bot/handlers');
const router = express.Router();

// POST /webhook/stripe
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Stripe webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Stripe event: ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const appointmentId = session.metadata?.appointment_id;
      const patientPhone = session.metadata?.patient_phone;

      if (appointmentId && appointmentId !== 'temp') {
        // Update appointment as paid
        await supabase.from('appointments')
          .update({ status: 'confirmed', paid: true, payment_method: 'stripe' })
          .eq('id', appointmentId);

        // Create payment record
        await supabase.from('payments').insert({
          appointment_id: appointmentId,
          patient_name: session.customer_details?.name || 'Paciente',
          amount: session.amount_total / 100,
          deposit_amount: session.amount_total / 100,
          stripe_session_id: session.id,
          status: 'completed',
          method: 'stripe'
        });

        // Notify patient via WhatsApp
        await handlers.handlePaymentConfirmed(appointmentId);
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object;
      const appointmentId = session.metadata?.appointment_id;
      if (appointmentId) {
        await supabase.from('appointments')
          .update({ status: 'cancelled' })
          .eq('id', appointmentId);
      }
      break;
    }
  }

  res.json({ received: true });
});

module.exports = router;
