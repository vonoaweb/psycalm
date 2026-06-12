const { supabase } = require('../config/supabase');
const { calcomClient } = require('../config/calcom');
const { stripe } = require('../config/stripe');
const notification = require('../services/notification');
const flows = require('./flows');

class BotHandlers {
  // Handle !agendar
  async handleAgendar(phone, conv) {
    const { data: feeTypes } = await supabase
      .from('fee_types')
      .select('*')
      .eq('active', true)
      .order('fee', { ascending: true });

    await notification.sendText(phone, flows.selectType(feeTypes || []));
    return { state: 'selecting_type', data: { ...conv.data, fee_types: feeTypes } };
  }

  // Handle type selection
  async handleTypeSelection(phone, message, conv) {
    const feeTypes = conv.data?.fee_types || [];
    const selected = this.parseSelection(message, feeTypes);
    if (!selected) {
      await notification.sendText(phone, 'Por favor elige una opción válida.');
      return { state: 'selecting_type', data: conv.data };
    }

    // Fetch availability from Cal.com
    const availability = await this.getAvailability(selected.duration);
    const sections = this.formatAvailabilityList(availability);

    await notification.sendList(phone, 'Elige una fecha y hora:', 'Ver horarios', sections);
    return { state: 'selecting_date', data: { ...conv.data, selected_type: selected } };
  }

  // Handle date/time selection
  async handleDateSelection(phone, selectionId, conv) {
    // Parse date and time from selection
    const [date, time] = selectionId.replace('slot_', '').split('_');
    const selectedType = conv.data?.selected_type;

    const summaryData = {
      ...conv.data,
      date,
      time,
      type: selectedType.type,
      type_label: selectedType.label,
      fee: selectedType.fee,
      deposit_percent: selectedType.deposit_percent,
      deposit_amount: Math.round(selectedType.fee * selectedType.deposit_percent / 100)
    };

    await notification.sendText(phone, flows.appointmentSummary(summaryData));
    await notification.sendButtons(phone, '¿Confirmas?', [
      { id: 'confirm_yes', title: '✅ Sí' },
      { id: 'confirm_no', title: '❌ No' }
    ]);

    return { state: 'confirming', data: summaryData };
  }

  // Handle confirmation
  async handleConfirmation(phone, confirmed, conv) {
    if (!confirmed) {
      await notification.sendText(phone, 'Ok, cancelado. Escribe *!agendar* para empezar de nuevo.');
      return { state: 'idle', data: {} };
    }

    const data = conv.data;

    // Create Cal.com booking (tentative)
    const booking = await this.createCalComBooking(data, phone);

    // Create Stripe payment link
    const stripeUrl = await this.createStripePaymentLink(data, phone);

    // Save appointment in DB
    const { data: apt } = await supabase.from('appointments').insert({
      patient_name: data.name || 'Paciente',
      patient_phone: phone,
      date: data.date,
      time: data.time,
      type: data.type,
      status: 'pending',
      fee: data.fee,
      deposit_percent: data.deposit_percent,
      deposit_amount: data.deposit_amount,
      calcom_booking_id: booking?.id
    }).select().single();

    await notification.sendText(phone, flows.paymentRequest(stripeUrl));

    return { state: 'awaiting_payment', data: { ...data, appointment_id: apt.id, stripe_session_id: stripeUrl } };
  }

  // Handle !citas
  async handleCitas(phone) {
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_phone', phone)
      .in('status', ['pending', 'confirmed'])
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    const { data: settings } = await supabase.from('settings').select('value').eq('key', 'practice_name').single();
    const practiceName = settings?.value?.name || 'la consulta';

    await notification.sendText(phone, flows.appointmentsList(appointments || []));
    return null; // no state change
  }

  // Handle !cancelar
  async handleCancelar(phone) {
    const { data: appointments } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_phone', phone)
      .in('status', ['pending', 'confirmed'])
      .order('date', { ascending: true });

    if (!appointments || appointments.length === 0) {
      await notification.sendText(phone, 'No tienes citas pendientes para cancelar.');
      return null;
    }

    const sections = [{
      title: 'Tus citas',
      rows: appointments.map((apt, i) => ({
        id: `cancel_${apt.id}`,
        title: `${apt.date} ${apt.time}`,
        description: apt.type
      }))
    }];

    await notification.sendList(phone, '¿Qué cita quieres cancelar?', 'Ver citas', sections);
    return { state: 'cancelling', data: { cancel_appointments: appointments } };
  }

  // Handle cancellation
  async handleCancelConfirm(phone, appointmentId, conv) {
    const { data: apt } = await supabase.from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .select().single();

    // Cancel in Cal.com if applicable
    if (apt?.calcom_booking_id) {
      await this.cancelCalComBooking(apt.calcom_booking_id);
    }

    await notification.sendText(phone, flows.cancelSuccess);
    return { state: 'idle', data: {} };
  }

  // Handle Stripe payment confirmation (called by webhook)
  async handlePaymentConfirmed(appointmentId) {
    const { data: apt } = await supabase.from('appointments')
      .update({ status: 'confirmed', paid: true })
      .eq('id', appointmentId)
      .select().single();

    if (apt) {
      await notification.sendText(apt.patient_phone, flows.paymentConfirmed({
        date: apt.date,
        time: apt.time,
        type_label: apt.type
      }));
    }
  }

  // Helper: Parse selection from message
  parseSelection(message, options) {
    const num = parseInt(message.match(/\d+/)?.[0]);
    if (num && num >= 1 && num <= options.length) return options[num - 1];
    const text = message.toLowerCase().trim();
    return options.find(o => o.label.toLowerCase().includes(text) || o.type.toLowerCase().includes(text));
  }

  // Helper: Get availability from Cal.com
  async getAvailability(duration) {
    try {
      const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
      const username = process.env.CALCOM_USERNAME;
      const start = new Date().toISOString().split('T')[0];
      const end = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

      const response = await calcomClient.get('/slots', {
        params: { eventTypeId, startTime: start, endTime: end }
      });

      return response.data?.data?.slots || [];
    } catch (err) {
      console.error('Cal.com availability error:', err.message);
      // Fallback: generate next 7 days
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date(Date.now() + i * 86400000);
        days.push({ date: d.toISOString().split('T')[0], slots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] });
      }
      return days;
    }
  }

  // Helper: Format availability for WhatsApp list
  formatAvailabilityList(availability) {
    const rows = [];
    availability.forEach(day => {
      (day.slots || []).forEach(slot => {
        const time = typeof slot === 'string' ? slot : slot.time;
        const date = day.date || day.startTime?.split('T')[0];
        rows.push({
          id: `slot_${date}_${time}`,
          title: `${date} ${time}`,
          description: 'Disponible'
        });
      });
    });
    return [{ title: 'Fechas disponibles', rows: rows.slice(0, 10) }]; // limit to 10
  }

  // Helper: Create Cal.com booking
  async createCalComBooking(data, phone) {
    try {
      const response = await calcomClient.post('/bookings', {
        eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID),
        start: `${data.date}T${data.time}:00`,
        attendee: {
          name: data.name || 'Paciente',
          email: data.email || `${phone}@temp.com`,
          timeZone: 'America/Mexico_City',
          phoneNumber: phone
        },
        metadata: { status: 'pending_payment', deposit: data.deposit_amount }
      });
      return response.data;
    } catch (err) {
      console.error('Cal.com booking error:', err.message);
      return null;
    }
  }

  // Helper: Cancel Cal.com booking
  async cancelCalComBooking(bookingId) {
    try {
      await calcomClient.delete(`/bookings/${bookingId}?allRemainingBookings=false`);
    } catch (err) {
      console.error('Cal.com cancel error:', err.message);
    }
  }

  // Helper: Create Stripe payment link
  async createStripePaymentLink(data, phone) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Anticipo - ${data.type_label}`,
              description: `Cita: ${data.date} ${data.time}`
            },
            unit_amount: data.deposit_amount * 100
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&appointment=${data.appointment_id || 'temp'}`,
        cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado`,
        metadata: {
          appointment_id: data.appointment_id || 'temp',
          patient_phone: phone,
          type: data.type
        }
      });
      return session.url;
    } catch (err) {
      console.error('Stripe error:', err.message);
      return `${process.env.FRONTEND_URL}/pago-manual?amount=${data.deposit_amount}`;
    }
  }
}

module.exports = new BotHandlers();
