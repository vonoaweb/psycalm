const express = require('express');
const { query, queryOne } = require('../config/database');
const router = express.Router();

// Session store (in-memory, will be cleared on restart)
const sessions = new Map();

// Helper to get/set session
function getSession(id) {
  if (!id || !sessions.has(id)) {
    const newId = 'sess_' + Math.random().toString(36).substring(2, 15);
    sessions.set(newId, { state: 'idle', data: {} });
    return { id: newId, ...sessions.get(newId) };
  }
  return { id, ...sessions.get(id) };
}

function setSession(id, state, data) {
  sessions.set(id, { state, data });
}

// GET /api/chat/session
router.get('/session', async (req, res) => {
  try {
    const sess = getSession(null);
    const practiceName = await getPracticeName();

    res.json({
      success: true,
      sessionId: sess.id,
      message: `Hola! Soy el asistente virtual de *${practiceName}*.\n\nEn que puedo ayudarte?\n\n🗓 Agendar una cita\n📋 Ver mis citas\n❌ Cancelar una cita\n💰 Ver precios`,
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'cancelar', label: '❌ Cancelar' },
        { id: 'precios', label: '💰 Precios' }
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
    const input = (quickReplyId || message || '').toString().trim().toLowerCase();
    const sess = getSession(sessionId);

    let result;
    switch (sess.state) {
      case 'idle': result = await handleIdle(input, sess); break;
      case 'selecting_type': result = await handleTypeSelection(input, sess); break;
      case 'selecting_date': result = await handleDateSelection(input, sess); break;
      case 'selecting_time': result = await handleTimeSelection(input, sess); break;
      case 'confirming': result = await handleConfirmation(input, sess); break;
      case 'cancelling': result = await handleCancellation(input, sess); break;
      default: result = await handleIdle(input, sess);
    }

    if (result.nextState) setSession(sess.id, result.nextState, result.data || sess.data);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== HANDLERS ==========

async function handleIdle(input, sess) {
  if (input === 'agendar' || input.includes('agendar')) {
    const result = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
    const types = result.data;

    let msg = '📋 *Que tipo de sesion necesitas?*\n\n';
    types.forEach((t, i) => {
      msg += `${i + 1}️⃣ *${t.label}* — $${t.fee} MXN (${t.duration} min)\n`;
    });

    return {
      message: msg,
      nextState: 'selecting_type',
      data: { fee_types: types },
      quickReplies: types.map(t => ({
        id: `type_${t.type}`,
        label: `${t.label} ($${t.fee})`
      }))
    };
  }

  if (input === 'citas' || input.includes('citas')) {
    const result = await query("SELECT * FROM appointments WHERE status IN ('confirmed', 'pending') ORDER BY date ASC, time ASC LIMIT 10");
    const apts = result.data;

    if (apts.length === 0) {
      return {
        message: 'No tenes citas agendadas.\n\nQueres agendar una? 🗓',
        nextState: 'idle',
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };
    }

    let msg = '*📋 Tus citas:*\n\n';
    apts.forEach((a, i) => {
      const status = a.status === 'confirmed' ? '✅' : '⏳';
      msg += `${i + 1}. ${status} ${a.date} ${a.time} — ${a.type_label || a.type} ($${a.fee})\n`;
    });

    return {
      message: msg,
      nextState: 'idle',
      quickReplies: [
        { id: 'agendar', label: '🗓 Nueva cita' },
        { id: 'cancelar', label: '❌ Cancelar' },
        { id: 'precios', label: '💰 Precios' }
      ]
    };
  }

  if (input === 'cancelar' || input.includes('cancelar')) {
    const result = await query("SELECT * FROM appointments WHERE status IN ('confirmed', 'pending') ORDER BY date ASC LIMIT 10");
    const apts = result.data;

    if (apts.length === 0) {
      return {
        message: 'No tenes citas para cancelar.',
        nextState: 'idle',
        quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }, { id: 'ayuda', label: '❓ Ayuda' }]
      };
    }

    let msg = '*❌ Que cita queres cancelar?*\n\n';
    apts.forEach((a, i) => {
      msg += `${i + 1}. 📅 ${a.date} ${a.time} — ${a.type}\n`;
    });

    return {
      message: msg,
      nextState: 'cancelling',
      data: { cancel_apts: apts },
      quickReplies: apts.slice(0, 5).map(a => ({
        id: `cancel_${a.id}`,
        label: `${a.date} ${a.time}`
      })).concat([{ id: 'volver', label: '↩️ Volver' }])
    };
  }

  if (input === 'precios' || input.includes('precios')) {
    const result = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
    const types = result.data;

    let msg = '💰 *Nuestras tarifas:*\n\n';
    types.forEach(t => {
      const deposit = Math.round(t.fee * t.deposit_percent / 100);
      msg += `📋 ${t.label}: $${t.fee} MXN\n   Anticipo (${t.deposit_percent}%): $${deposit} MXN\n\n`;
    });

    return {
      message: msg,
      nextState: 'idle',
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'ayuda', label: '❓ Ayuda' }
      ]
    };
  }

  // Default: welcome
  const practiceName = await getPracticeName();
  return {
    message: `Hola! Soy el asistente de *${practiceName}*.\n\nEn que puedo ayudarte?`,
    nextState: 'idle',
    quickReplies: [
      { id: 'agendar', label: '🗓 Agendar' },
      { id: 'citas', label: '📋 Mis citas' },
      { id: 'cancelar', label: '❌ Cancelar' },
      { id: 'precios', label: '💰 Precios' }
    ]
  };
}

async function handleTypeSelection(input, sess) {
  const types = sess.data.fee_types || [];
  let selected = types.find(t => input === `type_${t.type}`);

  if (!selected) {
    const num = parseInt(input);
    if (num >= 1 && num <= types.length) selected = types[num - 1];
  }
  if (!selected) {
    return {
      message: 'Por favor elegi una opcion valida.',
      nextState: 'selecting_type',
      data: sess.data,
      quickReplies: types.map(t => ({ id: `type_${t.type}`, label: `${t.label} ($${t.fee})` }))
    };
  }

  // Generate next 7 days
  const days = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({ date: d.toISOString().split('T')[0], label: d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) });
  }

  let msg = `✅ *${selected.label}* seleccionada ($${selected.fee} MXN)\n\n📅 *Elegi una fecha:*\n\n`;
  days.forEach((d, i) => {
    msg += `${i + 1}. ${d.label}\n`;
  });

  return {
    message: msg,
    nextState: 'selecting_date',
    data: { ...sess.data, selected_type: selected, available_days: days },
    quickReplies: days.slice(0, 5).map(d => ({
      id: `date_${d.date}`,
      label: d.label
    }))
  };
}

async function handleDateSelection(input, sess) {
  const match = input.match(/^date_(.+)$/);
  if (!match) {
    return {
      message: 'Por favor elegi una fecha de la lista.',
      nextState: 'selecting_date',
      data: sess.data,
      quickReplies: (sess.data.available_days || []).slice(0, 5).map(d => ({
        id: `date_${d.date}`,
        label: d.label
      }))
    };
  }

  const date = match[1];
  const times = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];

  return {
    message: `📅 Fecha: *${date}*\n\n⏰ *Elegi un horario:*\n\n` + times.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    nextState: 'selecting_time',
    data: { ...sess.data, selected_date: date },
    quickReplies: times.map(t => ({ id: `time_${t}`, label: t }))
  };
}

async function handleTimeSelection(input, sess) {
  const match = input.match(/^time_(.+)$/);
  if (!match) {
    const times = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
    return {
      message: 'Por favor elegi un horario.',
      nextState: 'selecting_time',
      data: sess.data,
      quickReplies: times.map(t => ({ id: `time_${t}`, label: t }))
    };
  }

  const time = match[1];
  const st = sess.data.selected_type;
  const fee = st.fee;
  const depositPct = st.deposit_percent;
  const depositAmount = Math.round(fee * depositPct / 100);

  return {
    message: `📋 *Resumen de tu cita:*\n\n📅 Fecha: *${sess.data.selected_date}*\n⏰ Hora: *${time}*\n📋 Tipo: *${st.label}*\n💰 Total: *$${fee} MXN*\n💳 Anticipo (${depositPct}%): *$${depositAmount} MXN*\n\nConfirma la cita?`,
    nextState: 'confirming',
    data: { ...sess.data, selected_time: time, deposit_amount: depositAmount },
    quickReplies: [
      { id: 'confirm_yes', label: '✅ Confirmar' },
      { id: 'confirm_no', label: '❌ Cancelar' }
    ]
  };
}

async function handleConfirmation(input, sess) {
  if (input === 'confirm_no') {
    return {
      message: 'Ok, cancelado. Queres hacer algo mas?',
      nextState: 'idle',
      data: {},
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' }
      ]
    };
  }

  if (input !== 'confirm_yes' && input !== '✅ confirmar') {
    return {
      message: 'Por favor confirma o cancela.',
      nextState: 'confirming',
      data: sess.data,
      quickReplies: [
        { id: 'confirm_yes', label: '✅ Confirmar' },
        { id: 'confirm_no', label: '❌ Cancelar' }
      ]
    };
  }

  const { selected_type, selected_date, selected_time, deposit_amount } = sess.data;

  try {
    // Save appointment
    await query(
      `INSERT INTO appointments (patient_name, patient_phone, date, time, type, status, fee, deposit_percent, deposit_amount, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      ['Paciente Web', 'web', selected_date, selected_time, selected_type.type, 'pending', selected_type.fee, selected_type.deposit_percent, deposit_amount, selected_type.duration]
    );

    // Generate Stripe payment link (test mode)
    const paymentUrl = `https://pay.stripe.com/test/appointment?amount=${deposit_amount}&type=${selected_type.type}`;

    return {
      message: `✅ Cita reservada!\n\nPara confirmar, paga el anticipo de *$${deposit_amount} MXN*:\n\n*Pago con Stripe*\nLink: ${paymentUrl}\n\nUna vez pagado, tu cita queda confirmada.`,
      nextState: 'idle',
      data: {},
      paymentUrl: paymentUrl,
      quickReplies: [
        { id: 'citas', label: '📋 Ver mis citas' },
        { id: 'agendar', label: '🗓 Otra cita' },
        { id: 'ayuda', label: '❓ Ayuda' }
      ]
    };
  } catch (err) {
    console.error('Save appointment error:', err);
    return {
      message: 'Hubo un error guardando la cita. Intentalo de nuevo.',
      nextState: 'idle',
      data: {},
      quickReplies: [{ id: 'agendar', label: '🗓 Reintentar' }]
    };
  }
}

async function handleCancellation(input, sess) {
  if (input === 'volver' || input === '↩️ volver') {
    return {
      message: 'Que necesitas?',
      nextState: 'idle',
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
      message: 'Por favor elegi una cita de la lista.',
      nextState: 'cancelling',
      data: sess.data,
      quickReplies: (sess.data.cancel_apts || []).slice(0, 5).map(a => ({
        id: `cancel_${a.id}`,
        label: `${a.date} ${a.time}`
      })).concat([{ id: 'volver', label: '↩️ Volver' }])
    };
  }

  const aptId = match[1];
  await query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [aptId]);

  return {
    message: '✅ Tu cita ha sido cancelada.\n\nQueres agendar otra?',
    nextState: 'idle',
    data: {},
    quickReplies: [
      { id: 'agendar', label: '🗓 Agendar cita' },
      { id: 'citas', label: '📋 Mis citas' },
      { id: 'ayuda', label: '❓ Ayuda' }
    ]
  };
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
