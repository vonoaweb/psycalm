const express = require('express');
const axios = require('axios');
const { query } = require('../config/database');
const { calcomClient } = require('../config/calcom');
const { stripe } = require('../config/stripe');
const router = express.Router();

// Session store
const sessions = new Map();

const KIMI_BASE_URL = 'https://api.moonshot.ai/v1';
const KIMI_MODEL = 'kimi-k2.6';

function getSession(id) {
  if (!id || !sessions.has(id)) {
    const newId = 'sess_' + Math.random().toString(36).substring(2, 15);
    sessions.set(newId, { messages: [], data: {} });
    return { id: newId, ...sessions.get(newId) };
  }
  return { id, ...sessions.get(id) };
}

function setSession(id, sessData) {
  sessions.set(id, sessData);
}

function getSystemPrompt(practiceName, feeTypes) {
  const typesInfo = feeTypes.map(t => `\n- ${t.label}: $${t.fee} MXN, ${t.duration} minutos`).join('');
  return `Sos el asistente virtual de ${practiceName}, psicóloga clínica. Tu trabajo es ayudar a pacientes de forma cálida, empática y profesional.

REGLAS:
- Sos empático, calmado y claro. Nunca diagnosticás ni prescribís.
- Respondé en español mexicano.
- Si alguien menciona crisis, autolesiones o suicidio, respondé INMEDIATAMENTE con números de emergencia: Línea de la Vida 800 911 2000, Cruz Roja 065, Emergencias 911.
- Podés responder sobre: precios, tipos de consulta, cómo agendar, cancelar, o reagendar citas.
- No des consejos psicológicos específicos. Derivá siempre a la profesional.
- Cuando sea apropiado, sugerí agendar una cita.

TIPOS DE CONSULTA DISPONIBLES:${typesInfo}
- El anticipo es el 20% para confirmar la cita.

HORARIOS: Lunes a sábado de 9:00 a 17:00.

Pagos protegidos por Stripe. Hecho con Aparta.

Respondé en formato JSON con esta estructura EXACTA:
{"response": "tu respuesta empática aquí", "action": "none|schedule|prices|appointments|cancel|emergency|help", "buttons": [{"id": "string", "label": "string"}]}`;
}

async function callKimi(messages) {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) {
    return { response: 'El asistente de IA no está configurado. Por favor contactá al administrador.', action: 'none', buttons: [] };
  }

  try {
    const res = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      {
        model: KIMI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    const content = res.data.choices[0].message.content;
    
    // Try to parse JSON response
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          response: parsed.response || content,
          action: parsed.action || 'none',
          buttons: parsed.buttons || []
        };
      }
    } catch (e) {}

    // Fallback: return raw text
    return { response: content, action: 'none', buttons: [] };
  } catch (err) {
    console.error('Kimi API error:', err.message);
    return { response: 'Ups, estoy teniendo problemas técnicos. Intentá de nuevo en un momento.', action: 'none', buttons: [{ id: 'retry', label: '🔄 Reintentar' }] };
  }
}

// GET /api/chat/session
router.get('/session', async (req, res) => {
  try {
    const sess = getSession(null);
    const practiceName = await getPracticeName();
    
    const welcomeMsg = `¡Hola! 👋 Soy el asistente virtual de *${practiceName}*.

Estoy aquí para ayudarte con:
🗓 Agendar una cita
📋 Consultar tus citas
💰 Conocer precios
❓ Resolver dudas

¿En qué puedo ayudarte hoy?`;

    res.json({
      success: true,
      sessionId: sess.id,
      message: welcomeMsg,
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' },
        { id: 'ayuda', label: '❓ Tengo una duda' }
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/chat/message
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, quickReplyId } = req.body;
    const input = (quickReplyId || message || '').toString().trim();
    const sess = getSession(sessionId);
    const practiceName = await getPracticeName();

    // Handle known quick reply actions
    if (quickReplyId === 'agendar') {
      const result = await handleScheduleFlow('start', sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }

    if (quickReplyId === 'citas') {
      const result = await handleMyAppointments(sess);
      return res.json({ success: true, ...result });
    }

    if (quickReplyId === 'precios') {
      const result = await handlePrices(sess);
      return res.json({ success: true, ...result });
    }

    if (quickReplyId === 'cancelar') {
      const result = await handleCancelFlow('start', sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }

    // Handle active scheduling flow
    if (sess.data?.flow === 'scheduling') {
      const result = await handleScheduleFlow(input, sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }

    // Handle active cancellation flow
    if (sess.data?.flow === 'cancelling') {
      const result = await handleCancelFlow(input, sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }

    // AI response for free text
    const feeTypesResult = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
    const feeTypes = feeTypesResult.data || [];
    const systemPrompt = getSystemPrompt(practiceName, feeTypes);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...sess.messages.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: input }
    ];

    const aiResult = await callKimi(messages);

    // Update session history
    sess.messages.push({ role: 'user', content: input });
    sess.messages.push({ role: 'assistant', content: aiResult.response });
    setSession(sess.id, sess);

    // Build quick replies based on AI action + defaults
    let quickReplies = aiResult.buttons || [];
    if (aiResult.action === 'schedule' || input.toLowerCase().includes('agendar')) {
      quickReplies = [
        { id: 'agendar', label: '🗓 Sí, agendar' },
        { id: 'precios', label: '💰 Precios' },
        ...quickReplies
      ];
    } else if (aiResult.action === 'prices') {
      quickReplies = [
        { id: 'precios', label: '💰 Ver precios' },
        { id: 'agendar', label: '🗓 Agendar' },
        ...quickReplies
      ];
    } else if (quickReplies.length === 0) {
      quickReplies = [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' }
      ];
    }

    res.json({
      success: true,
      message: aiResult.response,
      quickReplies: quickReplies.slice(0, 4)
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== SCHEDULING FLOW ==========
async function handleScheduleFlow(input, sess) {
  const step = sess.data?.step || 'select_type';

  if (step === 'select_type') {
    const result = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
    const types = result.data;
    return {
      message: '📋 *¿Qué tipo de sesión necesitás?*\n\n' + types.map((t, i) => `${i + 1}️⃣ *${t.label}* — $${t.fee} MXN (${t.duration} min)`).join('\n'),
      data: { flow: 'scheduling', step: 'ask_name', fee_types: types },
      quickReplies: types.map(t => ({ id: `type_${t.type}`, label: `${t.label} ($${t.fee})` }))
    };
  }

  if (step === 'ask_name') {
    const types = sess.data.fee_types || [];
    let selected = types.find(t => input === `type_${t.type}`);
    if (!selected) {
      const num = parseInt(input);
      if (num >= 1 && num <= types.length) selected = types[num - 1];
    }
    if (!selected) {
      return {
        message: 'Por favor elegí una opción válida.',
        data: sess.data,
        quickReplies: types.map(t => ({ id: `type_${t.type}`, label: `${t.label} ($${t.fee})` }))
      };
    }
    return {
      message: `✅ *${selected.label}* seleccionada ($${selected.fee} MXN)\n\n📝 *¿Cuál es tu nombre completo?*`,
      data: { ...sess.data, step: 'ask_phone', selected_type: selected },
      quickReplies: []
    };
  }

  if (step === 'ask_phone') {
    const name = input.trim();
    if (!name || name.length < 3) {
      return { message: 'Por favor escribí tu nombre completo.', data: sess.data, quickReplies: [] };
    }
    return {
      message: `Gracias, *${name}*! 📱 *¿Cuál es tu número de teléfono (WhatsApp)?*`,
      data: { ...sess.data, step: 'ask_email', patient_name: name },
      quickReplies: []
    };
  }

  if (step === 'ask_email') {
    const phone = input.trim().replace(/\D/g, '');
    if (phone.length < 8) {
      return { message: 'Por favor escribí un número de teléfono válido.', data: sess.data, quickReplies: [] };
    }
    return {
      message: `📧 *¿Cuál es tu email?* (opcional, podés escribir "no")`,
      data: { ...sess.data, step: 'select_date', patient_phone: phone },
      quickReplies: [{ id: 'no_email', label: '❌ No tengo email' }]
    };
  }

  if (step === 'select_date') {
    const email = (input === 'no_email' || input.toLowerCase() === 'no') ? '' : input.trim();
    const st = sess.data.selected_type;

    // Fetch availability from Cal.com
    let slots = [];
    try {
      const eventTypeId = process.env.CALCOM_EVENT_TYPE_ID;
      const start = new Date().toISOString().split('T')[0];
      const end = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
      const response = await calcomClient.get('/slots', {
        params: { eventTypeId, startTime: start, endTime: end }
      });
      const calSlots = response.data?.data?.slots || [];
      slots = calSlots.map(day => ({
        date: day.date || day.startTime?.split('T')[0],
        slots: (day.slots || []).map(s => typeof s === 'string' ? s : s.time).filter(Boolean)
      })).filter(d => d.slots.length > 0);
    } catch (err) {
      console.error('Cal.com availability error:', err.message);
    }

    // Fallback if Cal.com fails
    if (!slots.length) {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(Date.now() + i * 86400000);
        if (d.getDay() === 0) continue;
        slots.push({ date: d.toISOString().split('T')[0], slots: ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'] });
      }
    }

    // Block booked slots
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
      })).filter(d => d.slots.length > 0);
    }

    const days = slots.slice(0, 7).map(d => ({
      date: d.date,
      label: new Date(d.date + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })
    }));

    return {
      message: `📅 *¿Qué fecha preferís?*`,
      data: { ...sess.data, step: 'select_time', patient_email: email, available_days: days, availability: slots },
      quickReplies: days.map(d => ({ id: `date_${d.date}`, label: d.label }))
    };
  }

  if (step === 'select_time') {
    const match = input.match(/^date_(.+)$/);
    if (!match) {
      return {
        message: 'Por favor elegí una fecha de la lista.',
        data: sess.data,
        quickReplies: (sess.data.available_days || []).map(d => ({ id: `date_${d.date}`, label: d.label }))
      };
    }

    const daySlots = sess.data.availability?.find(d => d.date === match[1]);
    const times = daySlots?.slots || ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

    return {
      message: `📅 Fecha: *${match[1]}*\n\n⏰ *Elegí un horario:*`,
      data: { ...sess.data, step: 'confirm', selected_date: match[1] },
      quickReplies: times.map(t => ({ id: `time_${t}`, label: t.substring(0, 5) }))
    };
  }

  if (step === 'confirm') {
    const match = input.match(/^time_(.+)$/);
    if (!match) {
      const daySlots = sess.data.availability?.find(d => d.date === sess.data.selected_date);
      const times = daySlots?.slots || ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
      return {
        message: 'Por favor elegí un horario.',
        data: sess.data,
        quickReplies: times.map(t => ({ id: `time_${t}`, label: t.substring(0, 5) }))
      };
    }

    const st = sess.data.selected_type;
    const deposit = Math.round(st.fee * st.deposit_percent / 100);
    return {
      message: `📋 *Resumen:*\n👤 ${sess.data.patient_name}\n📅 ${sess.data.selected_date}\n⏰ ${match[1]}\n📋 ${st.label}\n💰 $${st.fee} MXN\n💳 Anticipo: $${deposit} MXN\n\n¿Confirmás?`,
      data: { ...sess.data, step: 'save', selected_time: match[1], deposit_amount: deposit },
      quickReplies: [
        { id: 'confirm_yes', label: '✅ Confirmar y pagar' },
        { id: 'confirm_no', label: '❌ Cancelar' }
      ]
    };
  }

  if (step === 'save') {
    if (input !== 'confirm_yes') {
      return {
        message: 'Ok, cancelado. ¿Querés hacer algo más?',
        data: {},
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };
    }

    const { patient_name, patient_phone, patient_email, selected_type, selected_date, selected_time, deposit_amount } = sess.data;

    // Create Cal.com booking
    let calcomBookingId = null;
    try {
      const calRes = await calcomClient.post('/bookings', {
        eventTypeId: parseInt(process.env.CALCOM_EVENT_TYPE_ID),
        start: `${selected_date}T${selected_time}:00`,
        attendee: {
          name: patient_name,
          email: patient_email || `${patient_phone}@temp.com`,
          timeZone: 'America/Mexico_City',
          phoneNumber: patient_phone
        },
        metadata: { status: 'pending_payment', deposit: deposit_amount }
      });
      calcomBookingId = calRes.data?.data?.id || calRes.data?.id || null;
    } catch (err) {
      console.error('Cal.com booking error:', err.message);
    }

    // Save appointment in DB
    const aptResult = await query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, duration, calcom_booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [patient_name, patient_phone, patient_email, selected_date, selected_time, selected_type.type, 'pending', selected_type.fee, selected_type.deposit_percent, deposit_amount, selected_type.duration, calcomBookingId]
    );
    const appointment = aptResult.data[0];

    // Create Stripe Checkout Session
    let checkoutUrl = null;
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'mxn',
            product_data: {
              name: `Anticipo - ${selected_type.label}`,
              description: `Cita: ${selected_date} ${selected_time}`
            },
            unit_amount: deposit_amount * 100
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&appointment=${appointment.id}`,
        cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado?appointment=${appointment.id}`,
        metadata: {
          appointment_id: String(appointment.id),
          patient_phone: patient_phone,
          type: selected_type.type
        }
      });
      checkoutUrl = session.url;
    } catch (err) {
      console.error('Stripe session error:', err.message);
    }

    const payMsg = checkoutUrl
      ? `✅ *Cita reservada!*\n\nPara confirmar, pagá el anticipo de *$${deposit_amount} MXN* haciendo click en el botón de abajo.\n\nUna vez pagado, tu cita queda confirmada.`
      : `✅ *Cita reservada!*\n\nTe contactaremos para coordinar el pago del anticipo de *$${deposit_amount} MXN*.`;

    return {
      message: payMsg,
      data: { appointment_id: appointment.id },
      quickReplies: checkoutUrl
        ? [{ id: 'pay_link', label: '💳 Pagar anticipo', url: checkoutUrl }]
        : [
            { id: 'citas', label: '📋 Ver mis citas' },
            { id: 'agendar', label: '🗓 Otra cita' }
          ]
    };
  }

  return { message: 'Algo salió mal.', data: {}, quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }] };
}

// ========== APPOINTMENTS ==========
async function handleMyAppointments(sess) {
  const result = await query("SELECT * FROM appointments WHERE status IN ('confirmed', 'pending') ORDER BY date ASC, time ASC LIMIT 10");
  const apts = result.data;

  if (apts.length === 0) {
    return {
      message: 'No tenés citas agendadas. ¿Querés agendar una?',
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar' },
        { id: 'precios', label: '💰 Precios' }
      ]
    };
  }

  let msg = '*📋 Tus citas:*\n\n';
  apts.forEach((a, i) => {
    const status = a.status === 'confirmed' ? '✅' : '⏳';
    msg += `${i + 1}. ${status} ${a.date} ${a.time?.slice(0, 5)} — ${a.type}\n`;
  });

  return {
    message: msg,
    quickReplies: [
      { id: 'agendar', label: '🗓 Nueva cita' },
      { id: 'cancelar', label: '❌ Cancelar' },
      { id: 'precios', label: '💰 Precios' }
    ]
  };
}

// ========== PRICES ==========
async function handlePrices(sess) {
  const result = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
  const types = result.data;

  let msg = '💰 *Nuestras tarifas:*\n\n';
  types.forEach(t => {
    const deposit = Math.round(t.fee * t.deposit_percent / 100);
    msg += `📋 *${t.label}*: $${t.fee} MXN\n   ⏱ ${t.duration} min | 💳 Anticipo: $${deposit} MXN\n\n`;
  });

  return {
    message: msg,
    quickReplies: [
      { id: 'agendar', label: '🗓 Agendar cita' },
      { id: 'citas', label: '📋 Mis citas' }
    ]
  };
}

// ========== CANCELLATION ==========
async function handleCancelFlow(input, sess) {
  const step = sess.data?.step || 'select';

  if (step === 'select') {
    const result = await query("SELECT * FROM appointments WHERE status IN ('confirmed', 'pending') ORDER BY date ASC LIMIT 10");
    const apts = result.data;

    if (apts.length === 0) {
      return {
        message: 'No tenés citas para cancelar.',
        data: {},
        quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }]
      };
    }

    let msg = '*❌ ¿Qué cita querés cancelar?*\n\n';
    apts.forEach((a, i) => {
      msg += `${i + 1}. 📅 ${a.date} ${a.time?.slice(0, 5)}\n`;
    });

    return {
      message: msg,
      data: { flow: 'cancelling', step: 'confirm', cancel_apts: apts },
      quickReplies: apts.slice(0, 5).map(a => ({
        id: `cancel_${a.id}`,
        label: `${a.date} ${a.time?.slice(0, 5)}`
      })).concat([{ id: 'volver', label: '↩️ Volver' }])
    };
  }

  if (step === 'confirm') {
    if (input === 'volver') {
      return {
        message: '¿Qué necesitás?',
        data: {},
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };
    }

    const match = input.match(/^cancel_(.+)$/);
    if (!match) {
      return {
        message: 'Por favor elegí una cita de la lista.',
        data: sess.data,
        quickReplies: (sess.data.cancel_apts || []).slice(0, 5).map(a => ({
          id: `cancel_${a.id}`,
          label: `${a.date} ${a.time?.slice(0, 5)}`
        })).concat([{ id: 'volver', label: '↩️ Volver' }])
      };
    }

    await query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [match[1]]);
    return {
      message: '✅ Tu cita ha sido cancelada. ¿Querés agendar otra?',
      data: {},
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' }
      ]
    };
  }

  return { message: 'Algo salió mal.', data: {}, quickReplies: [{ id: 'volver', label: '↩️ Volver' }] };
}

async function getPracticeName() {
  try {
    const result = await query("SELECT value FROM settings WHERE key = 'practice_name'");
    if (result.data.length > 0 && result.data[0].value) {
      const v = result.data[0].value;
      if (typeof v === 'string') {
        try { return JSON.parse(v).name || 'la consulta'; } catch { return v; }
      }
      return v.name || 'la consulta';
    }
  } catch (e) {}
  return 'la consulta';
}

module.exports = router;
