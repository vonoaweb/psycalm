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

// ========== SMART CHAT BRAIN ==========

// FAQ Database
const faqDatabase = [
  {
    keywords: ['direccion', 'ubicacion', 'donde', 'ubicado', 'dirección', 'ubicación', 'dónde', 'domicilio', 'consultorio', 'dirección'],
    responses: [
      'Nuestro consultorio está en Guadalajara, Jalisco. Te envío la dirección exacta al confirmar tu cita. ¿Querés agendar?',
      'Atendemos en Guadalajara. La dirección exacta te la compartimos por WhatsApp una vez confirmada la cita. ¿Te gustaría reservar?'
    ]
  },
  {
    keywords: ['seguro', 'seguros', 'imss', 'gastos medicos', 'gastos médicos', 'aseguradora', 'cubre'],
    responses: [
      'Por el momento trabajamos con pago directo. El anticipo del 20% se paga por Stripe y el resto en la consulta. ¿Te gustaría agendar?',
      'No manejamos seguros médicos por ahora. El pago es directo y seguro a través de Stripe. ¿Querés ver los precios?'
    ]
  },
  {
    keywords: ['cancelar', 'cancelacion', 'cancelación', 'reembolso', 'devolver', 'devolución', 'devolucion'],
    responses: [
      'Podés cancelar tu cita con 24 horas de anticipación. El anticipo no es reembolsable, pero podés reagendar sin costo extra. ¿Querés cancelar una cita?',
      'Las cancelaciones con 24h de anticipación permiten reagendar. El anticipo se traslada a la nueva fecha. ¿Tenés una cita para cancelar?'
    ]
  },
  {
    keywords: ['online', 'virtual', 'zoom', 'videollamada', 'video', 'remota', 'a distancia'],
    responses: [
      'Sí, ofrecemos sesiones online por videollamada. Es igual de efectiva que la presencial. ¿Te gustaría agendar una sesión online?',
      'Contamos con consultas online de 50 minutos. Te enviamos el link de videollamada al confirmar. ¿Querés reservar?'
    ]
  },
  {
    keywords: ['primera vez', 'nunca fui', 'primera consulta', 'nueva paciente', 'nuevo paciente', 'como funciona', 'cómo funciona'],
      responses: [
      'En la primera consulta hacemos una evaluación completa, conocemos tu historia y definimos objetivos de tratamiento. Dura 60 minutos. ¿Te gustaría agendar?',
      'La primera sesión es de evaluación (60 min). Conocemos tus necesidades y creamos un plan juntos. ¿Querés reservar tu primera consulta?'
    ]
  },
  {
    keywords: ['duracion', 'duración', 'cuanto dura', 'cuánto dura', 'tiempo', 'minutos', 'hora'],
    responses: [
      'La primera consulta dura 60 minutos. Las sesiones regulares son de 50 minutos. Las de pareja de 80 minutos. ¿Te gustaría agendar?',
      'Depende del tipo: primera vez 60 min, regular 50 min, pareja 80 min, online 50 min. ¿Cuál te interesa?'
    ]
  },
  {
    keywords: ['metodo pago', 'método pago', 'tarjeta', 'transferencia', 'oxxo', 'efectivo', 'como pago', 'cómo pago', 'forma de pago'],
    responses: [
      'Aceptamos tarjetas de crédito/débito a través de Stripe (muy seguro). El anticipo del 20% se paga online y el resto en la consulta. ¿Querés agendar?',
      'El pago del anticipo es con tarjeta vía Stripe. El saldo lo podés pagar en la consulta. ¿Te gustaría reservar?'
    ]
  },
  {
    keywords: ['gracias', 'thank', 'agradecido', 'agradecida', 'muy amable', 'te agradezco'],
    responses: [
      '¡De nada! 😊 Estoy aquí para lo que necesites. ¿Te gustaría agendar una cita o tenés alguna otra duda?',
      '¡Con gusto! 💚 ¿Te ayudo a agendar tu cita o hay algo más en lo que pueda ayudarte?'
    ]
  },
  {
    keywords: ['adios', 'adiós', 'chau', 'hasta luego', 'nos vemos', 'bye'],
    responses: [
      '¡Hasta luego! 🌿 Cuidate mucho. Si necesitás algo, acá estoy.',
      '¡Chau! 👋 Que tengas un bonito día. Recordá que podés agendar cuando quieras.'
    ]
  },
  {
    keywords: ['ansiedad', 'depresion', 'depresión', 'estres', 'estrés', 'panico', 'pánico', 'insomnio', 'triste', 'no puedo dormir', 'ataque', 'crisis'],
    responses: [
      'Entiendo que podés estar pasando por un momento difícil. 💚 Estoy aquí para ayudarte a agendar una cita con la profesional. Si sentís que estás en crisis, llamá a la Línea de la Vida: 800 911 2000. ¿Querés que te ayude a reservar una cita?',
      'Lamento que estés pasando por eso. La terapia puede ayudarte mucho. ¿Querés que agendemos una consulta? También podés llamar a Cruz Roja 065 si es una emergencia.'
    ]
  },
  {
    keywords: ['pareja', 'matrimonio', 'esposo', 'esposa', 'novio', 'novia', 'relacion', 'relación', 'conflicto', 'divorcio', 'separacion', 'separación'],
    responses: [
      'Ofrecemos terapia de pareja de 80 minutos. Es un espacio seguro para ambos. ¿Te gustaría agendar una sesión?',
      'La terapia de pareja puede ayudar mucho a mejorar la comunicación. Las sesiones son de 80 minutos. ¿Querés reservar?'
    ]
  },
  {
    keywords: ['ninos', 'niños', 'niña', 'niño', 'adolescente', 'adolescentes', 'hijo', 'hija', 'infantil', 'menor'],
    responses: [
      'Atendemos adolescentes a partir de 13 años. Para menores de edad se requiere autorización de un adulto. ¿Querés agendar?',
      'Trabajamos con adolescentes (13+). La primera consulta incluye una entrevista con los padres. ¿Te gustaría reservar?'
    ]
  },
  {
    keywords: ['hora', 'horario', 'horarios', 'a que hora', 'qué hora', 'cuándo', 'cuando', 'disponibilidad', 'turno', 'quedan'],
    responses: [
      'Atendemos de lunes a sábado de 9:00 a 17:00. ¿Te gustaría ver qué horarios tenemos disponibles?',
      'Nuestros horarios son de lunes a sábado, 9 a 17 hs. ¿Querés que veamos qué turnos quedan libres?'
    ]
  },
  {
    keywords: ['emergencia', 'emergencias', 'suicidio', 'suicida', 'morir', 'muerte', 'lastimar', 'cortar', 'pastillas', 'no quiero vivir'],
    responses: [
      '🚨 Esto es importante. No estás solo/a. Llamá ahora a la Línea de la Vida: 800 911 2000. También podés llamar al 911 o Cruz Roja 065. Tu vida importa. 🆘',
      '🆘 Si estás en crisis, por favor llamá ahora: Línea de la Vida 800 911 2000, o 911. No estás solo/a. Hay personas que quieren ayudarte. 💚'
    ],
    isEmergency: true
  }
];

function detectIntent(input) {
  const lower = input.toLowerCase().trim();
  let bestMatch = null;
  let bestScore = 0;

  for (const faq of faqDatabase) {
    let score = 0;
    for (const kw of faq.keywords) {
      if (lower === kw) { score += 10; } // exact match
      else if (lower.includes(kw)) { score += 5; } // contains
      else if (kw.includes(lower) && lower.length > 3) { score += 2; } // partial
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  // Also detect structural intents
  if (lower.match(/\b(agendar|reservar|sacar|pedir|quiero cita|quiero turno|quiero consulta)\b/)) {
    return { intent: 'schedule', confidence: 10 };
  }
  if (lower.match(/\b(precio|precios|costo|costos|tarifa|cuanto|cuesta|vale)\b/)) {
    return { intent: 'prices', confidence: 10 };
  }
  if (lower.match(/\b(cita|turno|consulta|sesion|sesión).*(ver|mis|tengo|checar|revisar)\b/)) {
    return { intent: 'appointments', confidence: 10 };
  }
  if (lower.match(/\b(cancelar|anular|eliminar|borrar)\b/) && lower.match(/\b(cita|turno|consulta|sesion|sesión)\b/)) {
    return { intent: 'cancel', confidence: 10 };
  }
  if (lower.match(/\b(hola|buen|hey|hi|saludos|qué tal|como va|cómo va)\b/) && lower.length < 20) {
    return { intent: 'greeting', confidence: 10 };
  }
  if (lower.match(/\b(adios|adiós|chau|bye|nos vemos|hasta luego)\b/)) {
    return { intent: 'goodbye', confidence: 10 };
  }
  if (lower.match(/\b(gracias|agradecido|agradecida|muy amable)\b/)) {
    return { intent: 'thanks', confidence: 10 };
  }
  if (lower.match(/\b(ayuda|help|no entiendo|como funciona|cómo funciona|que hago|qué hago|info|informacion|información)\b/)) {
    return { intent: 'help', confidence: 8 };
  }

  if (bestMatch && bestScore >= 5) {
    return { intent: 'faq', faq: bestMatch, confidence: bestScore };
  }

  return { intent: 'unknown', confidence: 0 };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getSmartResponse(intentResult, context, practiceName) {
  const { intent, faq } = intentResult;
  const name = context.patientName || '';
  const greeting = name ? `¡Hola ${name}! ` : '';

  switch (intent) {
    case 'greeting':
      return {
        response: `${greeting}¡Hola! 👋 Soy el asistente virtual de *${practiceName}*.

Estoy aquí para ayudarte con:
🗓 Agendar una cita
📋 Consultar tus citas
💰 Conocer precios
❓ Resolver dudas

¿En qué puedo ayudarte hoy?`,
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar cita' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };

    case 'goodbye':
      return {
        response: pickRandom([
          '¡Hasta luego! 🌿 Cuidate mucho. Recordá que podés agendar cuando quieras.',
          '¡Chau! 👋 Que tengas un bonito día. Estoy acá cuando me necesites.',
          '¡Nos vemos! 💚 Si necesitás algo, no dudes en escribirme.'
        ]),
        quickReplies: [{ id: 'agendar', label: '🗓 Agendar otra cita' }]
      };

    case 'thanks':
      return {
        response: pickRandom([
          '¡De nada! 😊 ¿Te ayudo a agendar tu cita o tenés alguna otra duda?',
          '¡Con gusto! 💚 ¿Querés reservar una cita?',
          'Es un placer ayudarte. ¿Te gustaría agendar ahora?'
        ]),
        quickReplies: [
          { id: 'agendar', label: '🗓 Sí, agendar' },
          { id: 'precios', label: '💰 Ver precios' }
        ]
      };

    case 'schedule':
      return {
        response: '¡Perfecto! Te ayudo a agendar. Elegí el tipo de sesión:',
        quickReplies: [] // Will be filled by the scheduling flow
      };

    case 'prices':
      return {
        response: 'Te muestro los precios. ¿Querés verlos?',
        quickReplies: [{ id: 'precios', label: '💰 Ver precios' }, { id: 'agendar', label: '🗓 Agendar' }]
      };

    case 'appointments':
      return {
        response: '¿Querés ver tus citas agendadas?',
        quickReplies: [{ id: 'citas', label: '📋 Mis citas' }, { id: 'agendar', label: '🗓 Nueva cita' }]
      };

    case 'cancel':
      return {
        response: '¿Querés cancelar una cita? Te muestro tus citas activas.',
        quickReplies: [{ id: 'cancelar', label: '❌ Cancelar cita' }, { id: 'citas', label: '📋 Ver citas' }]
      };

    case 'help':
      return {
        response: '¡Claro! 💚 Te cuento lo que puedo hacer por vos:\n\n🗓 Agendar citas\n📋 Ver tus citas\n💰 Consultar precios\n❌ Cancelar citas\n📍 Info del consultorio\n\n¿Qué necesitás?',
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };

    case 'faq':
      const resp = pickRandom(faq.responses);
      return {
        response: resp,
        quickReplies: faq.isEmergency
          ? [{ id: 'agendar', label: '🗓 Agendar cita (apoyo)' }]
          : [
              { id: 'agendar', label: '🗓 Agendar' },
              { id: 'precios', label: '💰 Precios' },
              { id: 'citas', label: '📋 Mis citas' }
            ]
      };

    default:
      return {
        response: `${greeting}Entiendo. ¿Te gustaría agendar una cita o tenés alguna duda sobre precios o horarios?`,
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar cita' },
          { id: 'precios', label: '💰 Precios' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'ayuda', label: '❓ Ayuda' }
        ]
      };
  }
}

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
    return { response: null, action: 'none', buttons: [] };
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
    return { response: null, action: 'none', buttons: [] };
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

    // === SMART BRAIN: detect intent first, use Kimi only for complex queries ===
    const intentResult = detectIntent(input);
    let responseText, quickReplies;

    // If strong intent match, use Smart Brain directly (fast & accurate)
    if (intentResult.confidence >= 5 || ['greeting', 'goodbye', 'thanks', 'help', 'emergency'].includes(intentResult.intent)) {
      const smart = getSmartResponse(intentResult, sess.data || {}, practiceName);
      responseText = smart.response;
      quickReplies = smart.quickReplies;
    } else {
      // Complex query → try Kimi AI
      const feeTypesResult = await query('SELECT * FROM fee_types WHERE active = true ORDER BY fee ASC');
      const feeTypes = feeTypesResult.data || [];
      const systemPrompt = getSystemPrompt(practiceName, feeTypes);
      const messages = [
        { role: 'system', content: systemPrompt },
        ...sess.messages.slice(-10),
        { role: 'user', content: input }
      ];

      const aiResult = await callKimi(messages);

      if (aiResult.response) {
        responseText = aiResult.response;
        quickReplies = aiResult.buttons || [];
      } else {
        // Kimi failed → use Smart Brain fallback
        const smart = getSmartResponse(intentResult, sess.data || {}, practiceName);
        responseText = smart.response;
        quickReplies = smart.quickReplies;
      }

      // Override quick replies for known actions
      if (aiResult.action === 'schedule' || input.toLowerCase().includes('agendar')) {
        quickReplies = [{ id: 'agendar', label: '🗓 Sí, agendar' }, { id: 'precios', label: '💰 Precios' }, ...quickReplies];
      } else if (aiResult.action === 'prices') {
        quickReplies = [{ id: 'precios', label: '💰 Ver precios' }, { id: 'agendar', label: '🗓 Agendar' }, ...quickReplies];
      }
    }

    // Try to remember patient's name from free text
    if (!sess.data?.patientName && input.length > 2 && input.length < 40) {
      const nameMatch = input.match(/^(soy|me llamo|mi nombre es)\s+(.+)$/i);
      if (nameMatch) {
        sess.data = { ...sess.data, patientName: nameMatch[2].trim() };
      }
    }

    // Ensure we always have some quick replies
    if (!quickReplies || quickReplies.length === 0) {
      quickReplies = [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' }
      ];
    }

    // Update session history
    sess.messages.push({ role: 'user', content: input });
    sess.messages.push({ role: 'assistant', content: responseText });
    setSession(sess.id, sess);

    res.json({
      success: true,
      message: responseText,
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
