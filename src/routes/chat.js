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

// ========== PERSONALITY ENGINE ==========

const botName = 'Sofía';

const greetings = [
  '¡Hola! Qué bueno que estés aquí. Soy Sofía, la asistente de la consulta. ¿Cómo estás hoy?',
  'Hola, bienvenido/a. Me llamo Sofía y estoy para ayudarte. ¿En qué puedo acompañarte?',
  '¡Qué tal! Soy Sofía, asistente del consultorio. ¿Cómo te encuentras?'
];

const offTopicResponses = [
  'Mmm, no estoy segura de entender bien. Estoy aquí para ayudarte con temas del consultorio — agendar citas, precios, o si tienes alguna duda sobre el proceso. ¿Te gustaría que veamos eso?',
  'Jaja, ahí sí me atrapaste. La verdad es que estoy especializada en ayudarte con las citas y consultas del consultorio. ¿En qué puedo ayudarte de eso?',
  'Eso suena interesante, pero te cuento que estoy aquí para lo del consultorio. Si necesitas agendar, ver precios o tienes dudas sobre las sesiones, eso sí manejo. ¿Lo vemos?'
];

const promptInjectionResponses = [
  'Jaja, me parece que estamos jugando un poco. Estoy aquí para ayudarte en serio con las citas. ¿Quieres que hablemos de eso?',
  'Mmm, no caigo en esas. Pero sí te puedo ayudar a agendar una cita si quieres. ¿Te interesa?',
  'Me parece que estamos desviándonos. ¿Quieres que volvamos a lo del consultorio? Estoy para ayudarte de verdad.'
];

const unknownResponses = [
  'Te entiendo. A veces no sé bien cómo responder, pero estoy aprendiendo. ¿Te gustaría que te ayude a agendar una cita o ver los precios?',
  'Mmm, no estoy 100% segura de lo que necesitas, pero quiero ayudarte. ¿Quieres que veamos horarios disponibles?',
  'Perdón, a veces me cuesta entender. Estoy aquí para lo que necesites del consultorio. ¿Agendar, precios, o ver tus citas?'
];

const empathyPhrases = [
  'Entiendo que puede ser difícil dar el primer paso. Estás haciendo algo valiente.',
  'Me imagino que no es fácil. Buscar ayuda ya es un gran avance.',
  'Gracias por confiar en nosotros. Vamos a acompañarte en esto.',
  'Sé que a veces cuesta. Pero aquí estamos para escucharte.',
  'Lo que sientes es válido. No estás solo/a en esto.'
];

const transitionPhrases = [
  'Te cuento lo que puedo hacer por ti:',
  'Estas son las cosas en las que te puedo ayudar:',
  'Veamos, esto es lo que manejo:'
];

// ========== SAFETY & INTENT DETECTION ==========

const offTopicKeywords = [
  'tira la basura', 'basura', 'cocinar', 'receta', 'clima', 'futbol', 'fútbol',
  'politica', 'política', 'elecciones', 'bitcoin', 'crypto', 'comprar', 'vender',
  'netflix', 'pelicula', 'película', 'juego', 'videojuego', 'gta', 'minecraft',
  'tiktok', 'instagram', 'facebook', 'whatsapp', 'programar', 'codigo', 'código',
  'python', 'javascript', 'hackear', 'hack', 'ia generativa', 'chatgpt',
  'traducir', 'ingles', 'inglés', 'frances', 'alemán', 'aleman'
];

const promptInjectionPatterns = [
  /olvida todo/i, /ignora las reglas/i, /sos un bot/i, /no sos real/i,
  /system prompt/i, /prompt/i, /instrucciones/i, /rules/i, /olvida/i,
  /ahora actua como/i, /ahora actúa como/i, /simula ser/i, /roleplay/i,
  /hacete el/i, /hacete la/i, /contame un chiste/i, /contame un secreto/i,
  /cual es la contraseña/i, /cuál es la contraseña/i, /password/i, /admin/i,
  /base de datos/i, /sql/i, /drop table/i, /hack/i, /hackear/i
];

const emotionalKeywords = {
  anxiety: ['ansiedad', 'ansioso', 'ansiosa', 'nervioso', 'nerviosa', 'preocupado', 'preocupada', 'pánico', 'panico', 'ataque', 'no puedo respirar', 'taquicardia'],
  sadness: ['triste', 'deprimido', 'deprimida', 'lloro', 'llorar', 'vacío', 'vacío', 'no tengo ganas', 'todo me cuesta', 'desanimado'],
  anger: ['enojado', 'enojada', 'molesto', 'molesta', 'odio', 'rabia', 'me hierve', 'no aguanto'],
  crisis: ['suicidio', 'suicida', 'matarme', 'morir', 'no quiero vivir', 'no vale la pena', 'lastimarme', 'cortarme', 'pastillas', 'muerte'],
  insomnia: ['no duermo', 'insomnio', 'desvelo', 'pesadillas', 'no puedo dormir'],
  stress: ['estres', 'estrés', 'agobiado', 'agobiada', 'quemado', 'quemada', 'no doy abasto']
};

function detectOffTopic(input) {
  const lower = input.toLowerCase();
  for (const kw of offTopicKeywords) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

function detectPromptInjection(input) {
  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(input)) return true;
  }
  return false;
}

function detectEmotion(input) {
  const lower = input.toLowerCase();
  for (const [emotion, keywords] of Object.entries(emotionalKeywords)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return emotion;
    }
  }
  return null;
}

function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ========== FAQ KNOWLEDGE BASE ==========

const faqKnowledge = {
  insurance: {
    keywords: ['seguro', 'seguros', 'imss', 'gastos medicos', 'gastos médicos', 'aseguradora', 'cubre', 'oxxo', 'efectivo', 'transferencia'],
    responses: [
      'Por ahora trabajamos con pago directo. El anticipo del 20% se paga en línea con tarjeta (muy seguro por Stripe) y el resto lo puedes pagar en la consulta. Si en el futuro agregamos más métodos, te avisamos. ¿Te gustaría ver los precios?',
      'No manejamos seguros médicos por el momento. El pago es directo: el anticipo por Stripe con tarjeta de crédito o débito, y el saldo en la sesión. ¿Quieres ver las tarifas?'
    ]
  },
  location: {
    keywords: ['direccion', 'dirección', 'ubicacion', 'ubicación', 'donde', 'dónde', 'domicilio', 'consultorio', 'lugar', 'dirección'],
    responses: [
      'Atendemos en Guadalajara, Jalisco. La dirección exacta te la enviamos por WhatsApp o email una vez que confirmas la cita, junto con instrucciones de cómo llegar. ¿Quieres que agendemos?',
      'El consultorio está en Guadalajara. Te compartimos la dirección completa al confirmar tu cita, así no te pierdes. ¿Te gustaría reservar una cita?'
    ]
  },
  duration: {
    keywords: ['duracion', 'duración', 'cuanto dura', 'cuánto dura', 'tiempo', 'minutos', 'hora', 'cuánto tiempo', 'cuanto tiempo'],
    responses: [
      'Depende del tipo de sesión. La primera consulta es de 60 minutos porque hacemos una evaluación completa. Las sesiones regulares son de 50 minutos. La terapia de pareja dura 80 minutos. ¿Te interesa alguna en particular?',
      'La primera vez son 60 min (evaluación + plan), sesiones regulares 50 min, pareja 80 min, online 50 min. ¿Cuál te vendría mejor?'
    ]
  },
  online: {
    keywords: ['online', 'virtual', 'zoom', 'videollamada', 'video', 'remota', 'a distancia', 'desde casa'],
    responses: [
      'Sí, ofrecemos sesiones online por videollamada. Funciona igual de bien que la presencial y es ideal si vives lejos o prefieres la comodidad de tu casa. Te enviamos el link seguro al confirmar. ¿Te gustaría probar?',
      'Contamos con consultas online de 50 minutos por videollamada. Es una opción muy buena si no puedes venir en persona. ¿Quieres reservar una?'
    ]
  },
  firstTime: {
    keywords: ['primera vez', 'nunca fui', 'primera consulta', 'nueva paciente', 'nuevo paciente', 'como funciona', 'cómo funciona', 'que esperar', 'qué esperar'],
    responses: [
      'En la primera consulta nos sentamos a conocerte. Hacemos una evaluación de tu situación, tu historia y juntos definimos objetivos de tratamiento. No hay presión, es un espacio seguro. Dura 60 minutos. ¿Te animas a agendar?',
      'La primera sesión es de evaluación (60 min). Conocemos tus necesidades, hablamos de lo que te trae aquí y armamos un plan juntos. Es un proceso sin prisa. ¿Te gustaría reservar?'
    ]
  },
  payment: {
    keywords: ['metodo pago', 'método pago', 'tarjeta', 'oxxo', 'efectivo', 'como pago', 'cómo pago', 'forma de pago', 'pagar', 'pago'],
    responses: [
      'Aceptamos tarjetas de crédito y débito a través de Stripe (muy seguro). El anticipo del 20% se paga en línea al agendar, y el resto en la consulta. Si necesitas otra forma de pago, escríbenos y lo vemos. ¿Quieres agendar?',
      'El anticipo (20%) lo pagas con tarjeta vía Stripe cuando reservas. El saldo lo pagas en la sesión. Si necesitas otra opción, pregúntanos. ¿Te gustaría ver disponibilidad?'
    ]
  },
  cancellation: {
    keywords: ['cancelar', 'cancelacion', 'cancelación', 'reembolso', 'devolver', 'devolución', 'devolucion', 'no puedo ir'],
    responses: [
      'Puedes cancelar o reagendar con 24 horas de anticipación sin problema. El anticipo se traslada a la nueva fecha. Si cancelas con menos tiempo, lo evaluamos caso por caso. ¿Tienes una cita que mover?',
      'Entendemos que pueden pasar cosas. Con 24h de anticipación puedes reagendar sin costo. El anticipo se guarda para la nueva fecha. ¿Quieres que veamos tus citas?'
    ]
  },
  couple: {
    keywords: ['pareja', 'matrimonio', 'esposo', 'esposa', 'novio', 'novia', 'relacion', 'relación', 'conflicto', 'divorcio', 'separacion', 'separación', 'pareja'],
    responses: [
      'Ofrecemos terapia de pareja de 80 minutos. Es un espacio seguro donde ambos pueden expresarse y trabajar en la comunicación. No hace falta que estén "al borde" para venir. ¿Te interesa?',
      'La terapia de pareja dura 80 min y ayuda mucho a mejorar la comunicación, aunque no estén en crisis. ¿Quieres agendar una sesión?'
    ]
  },
  children: {
    keywords: ['ninos', 'niños', 'niña', 'niño', 'adolescente', 'adolescentes', 'hijo', 'hija', 'infantil', 'menor', 'mi hijo', 'mi hija'],
    responses: [
      'Atendemos adolescentes a partir de 13 años. Para menores de edad se necesita que venga un adulto (padre, madre o tutor) a la primera sesión. ¿Quieres que veamos disponibilidad?',
      'Trabajamos con adolescentes (13+). La primera consulta incluye una charla con los padres para entender el contexto. ¿Te gustaría reservar?'
    ]
  },
  schedule: {
    keywords: ['hora', 'horario', 'horarios', 'a que hora', 'qué hora', 'cuándo', 'cuando', 'disponibilidad', 'turno', 'quedan'],
    responses: [
      'Atendemos de lunes a sábado de 9:00 a 17:00. ¿Te gustaría que veamos qué horarios tenemos libres esta semana?',
      'Nuestros horarios son de lunes a sábado, de 9:00 a 17:00. ¿Quieres que busquemos uno que te funcione?'
    ]
  },
  anxiety: {
    keywords: ['ansiedad', 'ansioso', 'ansiosa', 'nervioso', 'nerviosa', 'preocupado', 'preocupada', 'pánico', 'panico', 'ataque', 'no puedo respirar', 'taquicardia', 'angustia', 'angustiado', 'angustiada'],
    responses: [
      'Entiendo que puede ser muy incómodo. La ansiedad se puede trabajar muy bien en terapia. No tienes que manejarlo solo/a. ¿Te gustaría que agendemos una primera consulta?',
      'La ansiedad es algo que mucha gente vive y sí se puede mejorar con acompañamiento profesional. ¿Quieres que veamos un horario para hablar?'
    ]
  },
  depression: {
    keywords: ['depresion', 'depresión', 'triste', 'deprimido', 'deprimida', 'lloro', 'llorar', 'vacio', 'vacío', 'no tengo ganas', 'todo me cuesta', 'desanimado', 'desanimada'],
    responses: [
      'Lamento que estés pasando por eso. Sentirse así no es fácil, y buscar ayuda ya es un paso importante. La terapia puede acompañarte mucho en esto. ¿Te animas a agendar?',
      'Gracias por compartirlo. Esas sensaciones son válidas y hay formas de trabajarlas. ¿Quieres que reservemos una cita para hablar?'
    ]
  },
  insomnia: {
    keywords: ['no duermo', 'insomnio', 'desvelo', 'pesadillas', 'no puedo dormir', 'dormir'],
    responses: [
      'El sueño es fundamental y cuando no descansamos bien, todo se complica. Hay técnicas que se pueden trabajar en sesión. ¿Quieres que agendemos?',
      'Dormir mal afecta todo el día. En terapia se pueden abordar las causas y mejorar el descanso. ¿Te interesa reservar una cita?'
    ]
  },
  thanks: {
    keywords: ['gracias', 'agradecido', 'agradecida', 'muy amable', 'te agradezco', 'mil gracias'],
    responses: [
      '¡De nada! 😊 Me alegra poder ayudarte. Si en algún momento necesitas algo más, aquí estoy. ¿Te gustaría que agendemos la cita?',
      '¡Con gusto! 💚 Estoy para lo que necesites. ¿Quieres reservar tu cita ahora?'
    ]
  },
  goodbye: {
    keywords: ['adios', 'adiós', 'chau', 'hasta luego', 'nos vemos', 'bye'],
    responses: [
      '¡Hasta luego! 🌿 Cuídate mucho. Recuerda que puedes escribirme cuando quieras.',
      '¡Hasta pronto! 👋 Que tengas un buen día. Estoy aquí si me necesitas.',
      '¡Nos vemos! 💚 Espero tu mensaje cuando quieras agendar o si tienes alguna duda.'
    ]
  }
};

function findFaq(input) {
  const lower = input.toLowerCase().trim();
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, faq] of Object.entries(faqKnowledge)) {
    let score = 0;
    for (const kw of faq.keywords) {
      if (lower === kw) score += 15;
      else if (lower.includes(kw)) score += 8;
      else if (kw.includes(lower) && lower.length > 3) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = faq;
    }
  }

  return bestMatch && bestScore >= 5 ? pickOne(bestMatch.responses) : null;
}

// ========== SMART RESPONSE ENGINE ==========

function buildSmartResponse(input, sess, practiceName) {
  const lower = input.toLowerCase().trim();
  const emotion = detectEmotion(input);
  const data = sess.data || {};

  // 1. EMERGENCY — highest priority
  if (emotion === 'crisis' || lower.includes('suicidio') || lower.includes('matarme') || lower.includes('no quiero vivir')) {
    return {
      message: `${pickOne(empathyPhrases)}\n\nPor favor, si estás en crisis, llama ahora:\n📞 Línea de la Vida: 800 911 2000\n📞 Cruz Roja: 065\n📞 Emergencias: 911\n\nTu vida importa. No estás solo/a. 💚`,
      quickReplies: [
        { id: 'agendar', label: '🗓 Quiero agendar' },
        { id: 'ayuda', label: '📞 Más recursos' }
      ]
    };
  }

  // 2. PROMPT INJECTION / TROLLING
  if (detectPromptInjection(input)) {
    return {
      message: pickOne(promptInjectionResponses),
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'precios', label: '💰 Precios' }
      ]
    };
  }

  // 3. OFF-TOPIC
  if (detectOffTopic(input)) {
    return {
      message: pickOne(offTopicResponses),
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'precios', label: '💰 Precios' },
        { id: 'ayuda', label: '❓ Ayuda' }
      ]
    };
  }

  // 4. GREETING
  if (lower.match(/^(hola|hey|buen|qué tal|como va|cómo va|saludos|hi|hello)/) && lower.length < 30) {
    return {
      message: pickOne(greetings) + `\n\n${pickOne(transitionPhrases)}\n\n🗓 Agendar una cita\n📋 Ver tus citas\n💰 Conocer precios\n❓ Resolver dudas`,
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar cita' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' },
        { id: 'ayuda', label: '❓ Ayuda' }
      ]
    };
  }

  // 5. STRUCTURAL INTENTS
  if (lower.match(/\b(agendar|reservar|sacar|pedir|quiero cita|quiero turno|quiero consulta|necesito cita)\b/)) {
    return {
      message: '¡Perfecto! Me alegra que quieras dar este paso. Te ayudo a encontrar un horario que te funcione. ¿Quieres empezar?',
      quickReplies: [{ id: 'agendar', label: '🗓 Sí, empecemos' }, { id: 'precios', label: '💰 Antes ver precios' }]
    };
  }

  if (lower.match(/\b(precio|precios|costo|costos|tarifa|cuanto cuesta|cuánto cuesta|vale|vale la consulta)\b/)) {
    return {
      message: 'Te muestro los precios. Cada tipo de sesión tiene su valor según la duración. ¿Quieres verlos?',
      quickReplies: [{ id: 'precios', label: '💰 Ver precios' }, { id: 'agendar', label: '🗓 Agendar' }]
    };
  }

  if (lower.match(/\b(cita|turno|consulta|sesion|sesión).*(ver|mis|tengo|checar|revisar|mi cita)\b/)) {
    return {
      message: '¿Quieres ver las citas que tienes agendadas?',
      quickReplies: [{ id: 'citas', label: '📋 Mis citas' }, { id: 'agendar', label: '🗓 Nueva cita' }]
    };
  }

  if (lower.match(/\b(cancelar|anular|eliminar|borrar)\b/) && lower.match(/\b(cita|turno|consulta|sesion|sesión)\b/)) {
    return {
      message: '¿Quieres cancelar una cita? Te muestro las que tienes activas.',
      quickReplies: [{ id: 'cancelar', label: '❌ Cancelar cita' }, { id: 'citas', label: '📋 Ver citas' }]
    };
  }

  // 6. EMOTIONAL RESPONSES (empathy first)
  if (emotion === 'anxiety') {
    return {
      message: `${pickOne(empathyPhrases)}\n\nLa ansiedad es algo que se puede trabajar muy bien en terapia. No tienes que manejarlo solo/a. ¿Te gustaría que agendemos una primera consulta?`,
      quickReplies: [{ id: 'agendar', label: '🗓 Sí, quiero agendar' }, { id: 'precios', label: '💰 Ver precios primero' }]
    };
  }

  if (emotion === 'sadness' || emotion === 'depression') {
    return {
      message: `${pickOne(empathyPhrases)}\n\nBuscar ayuda ya es un paso valiente. La terapia puede acompañarte en esto. ¿Te animas a agendar una primera consulta?`,
      quickReplies: [{ id: 'agendar', label: '🗓 Sí, quiero agendar' }, { id: 'precios', label: '💰 Ver precios primero' }]
    };
  }

  if (emotion === 'anger') {
    return {
      message: `${pickOne(empathyPhrases)}\n\nEntiendo que puede ser frustrante. A veces hablar con alguien ayuda a procesar eso. ¿Quieres que reservemos una cita?`,
      quickReplies: [{ id: 'agendar', label: '🗓 Quiero agendar' }, { id: 'ayuda', label: '❓ Tengo dudas' }]
    };
  }

  if (emotion === 'insomnia') {
    return {
      message: `${pickOne(empathyPhrases)}\n\nDormir mal afecta todo. En terapia se pueden trabajar técnicas para mejorar el descanso. ¿Te interesa agendar?`,
      quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }, { id: 'precios', label: '💰 Precios' }]
    };
  }

  if (emotion === 'stress') {
    return {
      message: `${pickOne(empathyPhrases)}\n\nSentirse agobiado/a es más común de lo que parece. La terapia puede darte herramientas para manejarlo mejor. ¿Quieres que veamos un horario?`,
      quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }, { id: 'precios', label: '💰 Precios' }]
    };
  }

  // 7. FAQ MATCH
  const faqResponse = findFaq(input);
  if (faqResponse) {
    return {
      message: faqResponse,
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar' },
        { id: 'precios', label: '💰 Precios' },
        { id: 'citas', label: '📋 Mis citas' }
      ]
    };
  }

  // 8. GOODBYE
  if (lower.match(/\b(adios|adiós|chau|bye|nos vemos|hasta luego|hasta pronto)\b/)) {
    return {
      message: pickOne(faqKnowledge.goodbye.responses),
      quickReplies: [{ id: 'agendar', label: '🗓 Agendar otra cita' }]
    };
  }

  // 9. THANKS
  if (lower.match(/\b(gracias|agradecido|agradecida|muy amable|te agradezco|mil gracias)\b/)) {
    return {
      message: pickOne(faqKnowledge.thanks.responses),
      quickReplies: [{ id: 'agendar', label: '🗓 Sí, agendar' }, { id: 'precios', label: '💰 Precios' }]
    };
  }

  // 10. HELP
  if (lower.match(/\b(ayuda|help|no entiendo|como funciona|cómo funciona|que hago|qué hago|info|informacion|información)\b/)) {
    return {
      message: `¡Claro! 💚 Te cuento lo que puedo hacer por ti:\n\n🗓 Agendar citas\n📋 Ver tus citas\n💰 Consultar precios\n❌ Cancelar citas\n📍 Info del consultorio\n\n¿Qué necesitas?`,
      quickReplies: [
        { id: 'agendar', label: '🗓 Agendar' },
        { id: 'citas', label: '📋 Mis citas' },
        { id: 'precios', label: '💰 Precios' }
      ]
    };
  }

  // 11. DEFAULT — natural, not robotic
  return {
    message: pickOne(unknownResponses),
    quickReplies: [
      { id: 'agendar', label: '🗓 Agendar cita' },
      { id: 'citas', label: '📋 Mis citas' },
      { id: 'precios', label: '💰 Precios' },
      { id: 'ayuda', label: '❓ Ayuda' }
    ]
  };
}

// ========== KIMI AI (complex queries only) ==========

function getSystemPrompt(practiceName, feeTypes) {
  const typesInfo = feeTypes.map(t => `\n- ${t.label}: $${t.fee} MXN, ${t.duration} minutos`).join('');
  return `Eres Sofía, asistente virtual de ${practiceName}, psicóloga clínica. Eres cálida, empática y profesional. Hablas como una persona real, no como un bot. Usas frases naturales, a veces un poco informales pero siempre respetuosas. Tuteas al paciente (nunca uses voseo).

REGLAS:
- Nunca diagnosticas ni prescribes.
- Responde en español mexicano natural.
- Si alguien menciona crisis, autolesiones o suicidio, responde INMEDIATAMENTE con números de emergencia.
- No des consejos psicológicos específicos. Deriva siempre a la profesional.
- Cuando sea apropiado, sugiere agendar una cita.

TIPOS DE CONSULTA:${typesInfo}
- El anticipo es el 20% para confirmar la cita.

HORARIOS: Lunes a sábado de 9:00 a 17:00.

Responde en formato JSON:
{"response": "tu respuesta empática aquí", "action": "none|schedule|prices|appointments|cancel|emergency|help", "buttons": [{"id": "string", "label": "string"}]}`;
}

async function callKimi(messages) {
  const apiKey = process.env.KIMI_API_KEY;
  if (!apiKey) return { response: null, action: 'none', buttons: [] };

  try {
    const res = await axios.post(
      `${KIMI_BASE_URL}/chat/completions`,
      { model: KIMI_MODEL, messages, temperature: 0.7, max_tokens: 800 },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const content = res.data.choices[0].message.content;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return { response: parsed.response || content, action: parsed.action || 'none', buttons: parsed.buttons || [] };
      }
    } catch (e) {}
    return { response: content, action: 'none', buttons: [] };
  } catch (err) {
    console.error('Kimi API error:', err.message);
    return { response: null, action: 'none', buttons: [] };
  }
}

// ========== ROUTES ==========

router.get('/session', async (req, res) => {
  try {
    const sess = getSession(null);
    const practiceName = await getPracticeName();
    res.json({
      success: true,
      sessionId: sess.id,
      message: pickOne(greetings) + `\n\n${pickOne(transitionPhrases)}\n\n🗓 Agendar una cita\n📋 Consultar tus citas\n💰 Conocer precios\n❓ Resolver dudas`,
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

router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, quickReplyId } = req.body;
    const input = (quickReplyId || message || '').toString().trim();
    const sess = getSession(sessionId);
    const practiceName = await getPracticeName();

    // Quick reply actions
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
    if (quickReplyId === 'ayuda') {
      return res.json({
        success: true,
        message: `¡Claro! 💚 Estas son las cosas que manejo:\n\n🗓 Agendar citas\n📋 Ver tus citas\n💰 Precios\n❌ Cancelar citas\n📍 Info del consultorio\n\n¿Qué necesitas?`,
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      });
    }

    // Active flows
    if (sess.data?.flow === 'scheduling') {
      const result = await handleScheduleFlow(input, sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }
    if (sess.data?.flow === 'cancelling') {
      const result = await handleCancelFlow(input, sess);
      setSession(sess.id, { messages: sess.messages, data: result.data });
      return res.json({ success: true, ...result });
    }

    // Smart Brain handles everything
    const smart = buildSmartResponse(input, sess, practiceName);

    // Try to remember name
    if (!sess.data?.patientName && input.length > 2 && input.length < 40) {
      const nameMatch = input.match(/^(soy|me llamo|mi nombre es)\s+(.+)$/i);
      if (nameMatch) sess.data = { ...sess.data, patientName: nameMatch[2].trim() };
    }

    // Update history
    sess.messages.push({ role: 'user', content: input });
    sess.messages.push({ role: 'assistant', content: smart.message });
    setSession(sess.id, sess);

    res.json({ success: true, message: smart.message, quickReplies: smart.quickReplies });

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
      message: '📋 *¿Qué tipo de sesión necesitas?*\n\n' + types.map((t, i) => `${i + 1}️⃣ *${t.label}* — $${t.fee} MXN (${t.duration} min)`).join('\n'),
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
        message: 'Por favor elige una opción válida.',
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
      return { message: 'Por favor escribe tu nombre completo.', data: sess.data, quickReplies: [] };
    }
    return {
      message: `¡Gracias, *${name}*! 📱 *¿Cuál es tu número de teléfono (WhatsApp)?*`,
      data: { ...sess.data, step: 'ask_email', patient_name: name },
      quickReplies: []
    };
  }

  if (step === 'ask_email') {
    const phone = input.trim().replace(/\D/g, '');
    if (phone.length < 8) {
      return { message: 'Por favor escribe un número de teléfono válido.', data: sess.data, quickReplies: [] };
    }
    return {
      message: `📧 *¿Cuál es tu email?* (opcional, puedes escribir "no")`,
      data: { ...sess.data, step: 'select_date', patient_phone: phone },
      quickReplies: [{ id: 'no_email', label: '❌ No tengo email' }]
    };
  }

  if (step === 'select_date') {
    const email = (input === 'no_email' || input.toLowerCase() === 'no') ? '' : input.trim();
    const st = sess.data.selected_type;

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

    if (!slots.length) {
      for (let i = 1; i <= 7; i++) {
        const d = new Date(Date.now() + i * 86400000);
        if (d.getDay() === 0) continue;
        slots.push({ date: d.toISOString().split('T')[0], slots: ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'] });
      }
    }

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
      message: `📅 *¿Qué fecha prefieres?*`,
      data: { ...sess.data, step: 'select_time', patient_email: email, available_days: days, availability: slots },
      quickReplies: days.map(d => ({ id: `date_${d.date}`, label: d.label }))
    };
  }

  if (step === 'select_time') {
    const match = input.match(/^date_(.+)$/);
    if (!match) {
      return {
        message: 'Por favor elige una fecha de la lista.',
        data: sess.data,
        quickReplies: (sess.data.available_days || []).map(d => ({ id: `date_${d.date}`, label: d.label }))
      };
    }
    const daySlots = sess.data.availability?.find(d => d.date === match[1]);
    const times = daySlots?.slots || ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00'];
    return {
      message: `📅 Fecha: *${match[1]}*\n\n⏰ *Elige un horario:*`,
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
        message: 'Por favor elige un horario.',
        data: sess.data,
        quickReplies: times.map(t => ({ id: `time_${t}`, label: t.substring(0, 5) }))
      };
    }
    const st = sess.data.selected_type;
    const deposit = Math.round(st.fee * st.deposit_percent / 100);
    return {
      message: `📋 *Resumen:*\n👤 ${sess.data.patient_name}\n📅 ${sess.data.selected_date}\n⏰ ${match[1]}\n📋 ${st.label}\n💰 $${st.fee} MXN\n💳 Anticipo: $${deposit} MXN\n\n¿Confirmas?`,
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
        message: 'Ok, cancelado. ¿Quieres hacer algo más?',
        data: {},
        quickReplies: [
          { id: 'agendar', label: '🗓 Agendar' },
          { id: 'citas', label: '📋 Mis citas' },
          { id: 'precios', label: '💰 Precios' }
        ]
      };
    }

    const { patient_name, patient_phone, patient_email, selected_type, selected_date, selected_time, deposit_amount } = sess.data;

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

    const aptResult = await query(
      `INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, duration, calcom_booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [patient_name, patient_phone, patient_email, selected_date, selected_time, selected_type.type, 'pending', selected_type.fee, selected_type.deposit_percent, deposit_amount, selected_type.duration, calcomBookingId]
    );
    const appointment = aptResult.data[0];

    let checkoutUrl = null;
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'mxn',
            product_data: { name: `Anticipo - ${selected_type.label}`, description: `Cita: ${selected_date} ${selected_time}` },
            unit_amount: deposit_amount * 100
          },
          quantity: 1
        }],
        mode: 'payment',
        success_url: `${process.env.FRONTEND_URL}/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&appointment=${appointment.id}`,
        cancel_url: `${process.env.FRONTEND_URL}/pago-cancelado?appointment=${appointment.id}`,
        metadata: { appointment_id: String(appointment.id), patient_phone, type: selected_type.type }
      });
      checkoutUrl = session.url;
    } catch (err) {
      console.error('Stripe session error:', err.message);
    }

    const payMsg = checkoutUrl
      ? `✅ *¡Cita reservada!*\n\nPara confirmar, paga el anticipo de *$${deposit_amount} MXN* con el botón de abajo.\n\nUna vez pagado, tu cita queda confirmada.`
      : `✅ *¡Cita reservada!*\n\nTe contactaremos para coordinar el pago del anticipo de *$${deposit_amount} MXN*.`;

    return {
      message: payMsg,
      data: { appointment_id: appointment.id },
      quickReplies: checkoutUrl
        ? [{ id: 'pay_link', label: '💳 Pagar anticipo', url: checkoutUrl }]
        : [{ id: 'citas', label: '📋 Ver mis citas' }, { id: 'agendar', label: '🗓 Otra cita' }]
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
      message: 'No tienes citas agendadas. ¿Quieres agendar una?',
      quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }, { id: 'precios', label: '💰 Precios' }]
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
    quickReplies: [{ id: 'agendar', label: '🗓 Agendar cita' }, { id: 'citas', label: '📋 Mis citas' }]
  };
}

// ========== CANCELLATION ==========
async function handleCancelFlow(input, sess) {
  const step = sess.data?.step || 'select';

  if (step === 'select') {
    const result = await query("SELECT * FROM appointments WHERE status IN ('confirmed', 'pending') ORDER BY date ASC LIMIT 10");
    const apts = result.data;
    if (apts.length === 0) {
      return { message: 'No tienes citas para cancelar.', data: {}, quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }] };
    }
    let msg = '*❌ ¿Qué cita quieres cancelar?*\n\n';
    apts.forEach((a, i) => { msg += `${i + 1}. 📅 ${a.date} ${a.time?.slice(0, 5)}\n`; });
    return {
      message: msg,
      data: { flow: 'cancelling', step: 'confirm', cancel_apts: apts },
      quickReplies: apts.slice(0, 5).map(a => ({ id: `cancel_${a.id}`, label: `${a.date} ${a.time?.slice(0, 5)}` })).concat([{ id: 'volver', label: '↩️ Volver' }])
    };
  }

  if (step === 'confirm') {
    if (input === 'volver') {
      return { message: '¿Qué necesitas?', data: {}, quickReplies: [{ id: 'agendar', label: '🗓 Agendar' }, { id: 'citas', label: '📋 Mis citas' }, { id: 'precios', label: '💰 Precios' }] };
    }
    const match = input.match(/^cancel_(.+)$/);
    if (!match) {
      return {
        message: 'Por favor elige una cita de la lista.',
        data: sess.data,
        quickReplies: (sess.data.cancel_apts || []).slice(0, 5).map(a => ({ id: `cancel_${a.id}`, label: `${a.date} ${a.time?.slice(0, 5)}` })).concat([{ id: 'volver', label: '↩️ Volver' }])
      };
    }
    await query("UPDATE appointments SET status = 'cancelled' WHERE id = $1", [match[1]]);
    return {
      message: '✅ Tu cita ha sido cancelada. ¿Quieres agendar otra?',
      data: {},
      quickReplies: [{ id: 'agendar', label: '🗓 Agendar cita' }, { id: 'citas', label: '📋 Mis citas' }]
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
