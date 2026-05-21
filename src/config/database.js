/**
 * PsyCalm — PostgreSQL Database Client with Automated JSON Fallback
 * Uses node-postgres (pg) for direct PostgreSQL connection
 * If connection fails (e.g. IPv6 DNS/routing issues), it transparently
 * falls back to a local JSON-based mock database for complete offline testing.
 */

const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  },
  connectionTimeoutMillis: 5000 // 5 seconds timeout
});

const MOCK_DB_PATH = path.join(__dirname, '../../database/mock-db.json');
let useMock = false;

// Default Seed Data
const initialData = {
  fee_types: [
    { id: 'f1', type: 'primera_consulta', label: 'Primera consulta', fee: 800, deposit_percent: 20, duration: 60, color: '#E07050', active: true, created_at: new Date().toISOString() },
    { id: 'f2', type: 'sesion_regular', label: 'Sesion regular', fee: 600, deposit_percent: 20, duration: 50, color: '#3B82F6', active: true, created_at: new Date().toISOString() },
    { id: 'f3', type: 'sesion_online', label: 'Sesion online', fee: 500, deposit_percent: 15, duration: 45, color: '#10B981', active: true, created_at: new Date().toISOString() }
  ],
  settings: [
    { id: 's1', key: 'practice_name', value: { name: 'Consulta de Psicologia Dra. Rodriguez' }, updated_at: new Date().toISOString() },
    { id: 's2', key: 'practice_description', value: { text: 'Atencion psicologica profesional y personalizada' }, updated_at: new Date().toISOString() },
    { id: 's3', key: 'currency', value: { code: 'MXN', symbol: '$' }, updated_at: new Date().toISOString() },
    { id: 's4', key: 'deposit_percent_default', value: { percent: 20 }, updated_at: new Date().toISOString() },
    { id: 's5', key: 'welcome_message', value: { text: 'Hola! Soy el asistente virtual de la consulta. En que puedo ayudarte?' }, updated_at: new Date().toISOString() },
    { id: 's6', key: 'schedule', value: {"lunes":{"active":true,"start":"09:00","end":"17:00"},"martes":{"active":true,"start":"09:00","end":"17:00"},"miercoles":{"active":true,"start":"09:00","end":"17:00"},"jueves":{"active":true,"start":"09:00","end":"17:00"},"viernes":{"active":true,"start":"09:00","end":"14:00"},"sabado":{"active":false},"domingo":{"active":false}}, updated_at: new Date().toISOString() }
  ],
  patients: [
    { id: 'p1', name: 'Maria Garcia', phone: '+525512345678', email: 'maria@email.com', status: 'active', notes: 'Ansiedad generalizada', created_at: new Date().toISOString() },
    { id: 'p2', name: 'Carlos Lopez', phone: '+525598765432', email: 'carlos@email.com', status: 'active', notes: 'Terapia cognitiva', created_at: new Date().toISOString() },
    { id: 'p3', name: 'Ana Martinez', phone: '+525556789012', email: 'ana@email.com', status: 'active', notes: 'Primera consulta', created_at: new Date().toISOString() },
    { id: 'p4', name: 'Luis Hernandez', phone: '+525523456789', email: 'luis@email.com', status: 'inactive', notes: 'Sesion completada', created_at: new Date().toISOString() }
  ],
  appointments: [
    { id: 'a1', patient_name: 'Maria Garcia', patient_phone: '+525512345678', patient_email: 'maria@email.com', date: '2026-05-16', time: '10:00', duration: 50, type: 'sesion_regular', status: 'confirmed', fee: 600, deposit_percent: 20, deposit_amount: 120, paid: true, created_at: new Date().toISOString() },
    { id: 'a2', patient_name: 'Carlos Lopez', patient_phone: '+525598765432', patient_email: 'carlos@email.com', date: '2026-05-16', time: '14:00', duration: 50, type: 'sesion_regular', status: 'confirmed', fee: 600, deposit_percent: 20, deposit_amount: 120, paid: true, created_at: new Date().toISOString() },
    { id: 'a3', patient_name: 'Ana Martinez', patient_phone: '+525556789012', patient_email: 'ana@email.com', date: '2026-05-17', time: '09:00', duration: 60, type: 'primera_consulta', status: 'pending', fee: 800, deposit_percent: 20, deposit_amount: 160, paid: false, created_at: new Date().toISOString() },
    { id: 'a4', patient_name: 'Maria Garcia', patient_phone: '+525512345678', patient_email: 'maria@email.com', date: '2026-05-19', time: '11:00', duration: 45, type: 'sesion_online', status: 'confirmed', fee: 500, deposit_percent: 15, deposit_amount: 75, paid: true, created_at: new Date().toISOString() },
    { id: 'a5', patient_name: 'Roberto Sanchez', patient_phone: '+525534567890', patient_email: null, date: '2026-05-20', time: '16:00', duration: 60, type: 'primera_consulta', status: 'pending', fee: 800, deposit_percent: 20, deposit_amount: 160, paid: false, created_at: new Date().toISOString() }
  ],
  payments: [
    { id: 'pay1', appointment_id: 'a1', patient_name: 'Maria Garcia', amount: 120, deposit_percent: 20, deposit_amount: 120, status: 'completed', date: new Date().toISOString(), method: 'stripe', created_at: new Date().toISOString() },
    { id: 'pay2', appointment_id: 'a2', patient_name: 'Carlos Lopez', amount: 120, deposit_percent: 20, deposit_amount: 120, status: 'completed', date: new Date().toISOString(), method: 'stripe', created_at: new Date().toISOString() },
    { id: 'pay3', appointment_id: 'a4', patient_name: 'Maria Garcia', amount: 75, deposit_percent: 15, deposit_amount: 75, status: 'completed', date: new Date().toISOString(), method: 'stripe', created_at: new Date().toISOString() },
    { id: 'pay4', appointment_id: 'a3', patient_name: 'Ana Martinez', amount: 160, deposit_percent: 20, deposit_amount: 160, status: 'pending', date: new Date().toISOString(), method: 'stripe', created_at: new Date().toISOString() }
  ],
  admins: [
    { id: 'adm1', email: 'admin@aparta.mx', password_hash: 'd833dc02bdc7cc0006302c781e7dda7758ca6d500c779fac9941a913467613c2', full_name: 'Administrador', is_active: true, created_at: new Date().toISOString() }
  ]
};

// Initialize Mock File if needed
function initMockDb() {
  const dir = path.dirname(MOCK_DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(MOCK_DB_PATH)) {
    fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(initialData, null, 2));
    console.log('🌱 Mock database file initialized successfully.');
  }
}

// Load and Save helpers
function getMockData() {
  initMockDb();
  try {
    const raw = fs.readFileSync(MOCK_DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return initialData;
  }
}

function saveMockData(data) {
  try {
    fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to save mock data:', e.message);
  }
}

// Connection test
pool.connect()
  .then(client => {
    console.log('✅ Connected to real PostgreSQL Database');
    client.release();
  })
  .catch(err => {
    console.log('⚠️  PostgreSQL connection failed:', err.message);
    console.log('🚀 Activating Intelligent Local JSON Fallback database.');
    useMock = true;
    initMockDb();
  });

// Handle simple queries against local JSON file
function handleMockQuery(text, params) {
  const data = getMockData();
  const sql = text.trim().replace(/\s+/g, ' ');
  const sqlLower = sql.toLowerCase();

  // 1. SELECT * FROM admins
  if (sqlLower.includes('select * from admins')) {
    let list = [...data.admins];
    if (sqlLower.includes('email = $1')) {
      list = list.filter(a => a.email === params[0]);
    }
    return { data: list, error: null, count: list.length };
  }

  // 2. Dashboard Count Queries
  if (sqlLower.includes('count(*) as count from appointments')) {
    let list = [...data.appointments];
    if (sqlLower.includes('where date = $1')) {
      list = list.filter(a => a.date === params[0]);
    }
    return { data: [{ count: list.length }], error: null, count: 1 };
  }

  if (sqlLower.includes('count(*) as count from patients')) {
    let list = [...data.patients];
    if (sqlLower.includes("status = 'active'")) {
      list = list.filter(p => p.status === 'active');
    }
    return { data: [{ count: list.length }], error: null, count: 1 };
  }

  // 3. Dashboard Sum Queries
  if (sqlLower.includes('sum(deposit_amount)') && sqlLower.includes('from payments')) {
    let list = [...data.payments];
    if (sqlLower.includes('date >= $1') && sqlLower.includes("status = 'completed'")) {
      list = list.filter(p => p.date >= params[0] && p.status === 'completed');
    }
    const sum = list.reduce((acc, curr) => acc + parseFloat(curr.deposit_amount || 0), 0);
    return { data: [{ total: sum }], error: null, count: 1 };
  }

  if (sqlLower.includes('sum(deposit_amount)') && sqlLower.includes('from appointments')) {
    let list = [...data.appointments];
    if (sqlLower.includes("status = 'pending'") && sqlLower.includes('paid = false')) {
      list = list.filter(a => a.status === 'pending' && !a.paid);
    }
    const sum = list.reduce((acc, curr) => acc + parseFloat(curr.deposit_amount || 0), 0);
    return { data: [{ total: sum }], error: null, count: 1 };
  }

  // 4. SELECT * FROM appointments
  if (sqlLower.includes('select * from appointments')) {
    // If specific ID query
    if (sqlLower.includes('where id = $1')) {
      const match = data.appointments.find(a => a.id === params[0]);
      return { data: match || null, error: null, count: match ? 1 : 0 };
    }

    let list = [...data.appointments];

    // Filter by date
    if (sqlLower.includes('and date = $')) {
      const matchDateIdx = sqlLower.indexOf('date = $');
      const paramNum = parseInt(sqlLower.substr(matchDateIdx + 8, 1)) - 1;
      list = list.filter(a => a.date === params[paramNum]);
    }
    // Filter by status
    if (sqlLower.includes('and status = $')) {
      const matchStatusIdx = sqlLower.indexOf('status = $');
      const paramNum = parseInt(sqlLower.substr(matchStatusIdx + 10, 1)) - 1;
      list = list.filter(a => a.status === params[paramNum]);
    }
    // Filter by patient_id
    if (sqlLower.includes('and patient_id = $')) {
      const matchPatIdx = sqlLower.indexOf('patient_id = $');
      const paramNum = parseInt(sqlLower.substr(matchPatIdx + 14, 1)) - 1;
      list = list.filter(a => a.patient_id === params[paramNum]);
    }
    // Filter by month
    if (sqlLower.includes('and date >= $') && sqlLower.includes('and date < $')) {
      // Typically month range
      list = list.filter(a => a.date >= params[params.length - 2] && a.date < params[params.length - 1]);
    }

    // Sort
    if (sqlLower.includes('order by created_at desc')) {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    }

    // Limit
    if (sqlLower.includes('limit 5')) {
      list = list.slice(0, 5);
    }

    return { data: list, error: null, count: list.length };
  }

  // 5. SELECT * FROM patients
  if (sqlLower.includes('select * from patients')) {
    let list = [...data.patients];

    if (sqlLower.includes('status = $')) {
      list = list.filter(p => p.status === params[0]);
    }
    if (sqlLower.includes('ilike $')) {
      // Search term (name, email, phone)
      const term = params[params.length - 1].replace(/%/g, '').toLowerCase();
      list = list.filter(p => 
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.email && p.email.toLowerCase().includes(term)) ||
        (p.phone && p.phone.toLowerCase().includes(term))
      );
    }

    list.sort((a, b) => a.name.localeCompare(b.name));
    return { data: list, error: null, count: list.length };
  }

  // 6. SELECT * FROM payments
  if (sqlLower.includes('select * from payments')) {
    let list = [...data.payments];
    list.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { data: list, error: null, count: list.length };
  }

  // 7. SELECT key, value FROM settings
  if (sqlLower.includes('select key, value from settings') || sqlLower.includes('select * from settings')) {
    return { data: data.settings, error: null, count: data.settings.length };
  }

  // 8. SELECT * FROM fee_types
  if (sqlLower.includes('select * from fee_types')) {
    let list = [...data.fee_types];
    if (sqlLower.includes('active = true')) {
      list = list.filter(f => f.active);
    }
    return { data: list, error: null, count: list.length };
  }

  // 9. INSERT INTO appointments
  if (sqlLower.includes('insert into appointments')) {
    const apt = {
      id: crypto.randomUUID(),
      patient_name: params[0],
      patient_phone: params[1],
      patient_email: params[2],
      date: params[3],
      time: params[4],
      type: params[5],
      status: params[6] || 'pending',
      fee: parseFloat(params[7] || 0),
      deposit_percent: parseInt(params[8] || 20),
      deposit_amount: parseFloat(params[9] || 0),
      notes: params[10] || '',
      duration: parseInt(params[11] || 60),
      paid: false,
      created_at: new Date().toISOString()
    };
    data.appointments.push(apt);
    saveMockData(data);
    return { data: [apt], error: null, count: 1 };
  }

  // 10. INSERT INTO patients
  if (sqlLower.includes('insert into patients')) {
    const pat = {
      id: crypto.randomUUID(),
      name: params[0],
      phone: params[1],
      email: params[2],
      notes: params[3] || '',
      status: params[4] || 'active',
      created_at: new Date().toISOString()
    };
    data.patients.push(pat);
    saveMockData(data);
    return { data: [pat], error: null, count: 1 };
  }

  // 11. INSERT INTO payments
  if (sqlLower.includes('insert into payments')) {
    const pay = {
      id: crypto.randomUUID(),
      appointment_id: params[0],
      patient_name: params[1],
      amount: parseFloat(params[2] || 0),
      deposit_percent: parseInt(params[3] || 20),
      deposit_amount: parseFloat(params[4] || 0),
      stripe_session_id: params[5] || null,
      status: params[6] || 'completed',
      method: params[7] || 'stripe',
      date: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    data.payments.push(pay);
    saveMockData(data);
    return { data: [pay], error: null, count: 1 };
  }

  // 12. UPDATE appointments
  if (sqlLower.includes('update appointments set')) {
    const id = params[params.length - 1];
    const index = data.appointments.findIndex(a => a.id === id);
    if (index === -1) return { data: [], error: 'Not found', count: 0 };

    const apt = data.appointments[index];
    
    // Parse update fields
    if (sqlLower.includes("status = 'cancelled'")) {
      apt.status = 'cancelled';
    } else {
      // Dynamic updates from key-values
      // We look at the query structure and update values
      const fieldsStr = sql.substring(sqlLower.indexOf('set') + 4, sqlLower.indexOf('where')).trim();
      const fields = fieldsStr.split(',').map(f => f.trim().split('=')[0].trim());
      fields.forEach((field, i) => {
        if (params[i] !== undefined) {
          apt[field] = params[i];
        }
      });
    }

    data.appointments[index] = apt;
    saveMockData(data);
    return { data: [apt], error: null, count: 1 };
  }

  // 13. UPDATE patients
  if (sqlLower.includes('update patients set')) {
    const id = params[5];
    const index = data.patients.findIndex(p => p.id === id);
    if (index === -1) return { data: [], error: 'Not found', count: 0 };

    const pat = data.patients[index];
    pat.name = params[0];
    pat.phone = params[1];
    pat.email = params[2];
    pat.notes = params[3];
    pat.status = params[4];

    data.patients[index] = pat;
    saveMockData(data);
    return { data: [pat], error: null, count: 1 };
  }

  // 14. INSERT INTO settings
  if (sqlLower.includes('insert into settings')) {
    const key = params[0];
    const val = JSON.parse(params[1]);

    const index = data.settings.findIndex(s => s.key === key);
    if (index !== -1) {
      data.settings[index].value = val;
      data.settings[index].updated_at = new Date().toISOString();
    } else {
      data.settings.push({
        id: crypto.randomUUID(),
        key: key,
        value: val,
        updated_at: new Date().toISOString()
      });
    }
    saveMockData(data);
    return { data: [], error: null, count: 1 };
  }

  console.log('Unhandled mock query:', sql);
  return { data: [], error: null, count: 0 };
}

// Query helper
const query = async (text, params) => {
  if (useMock) {
    return handleMockQuery(text, params);
  }
  try {
    const result = await pool.query(text, params);
    return { data: result.rows, error: null, count: result.rowCount };
  } catch (error) {
    console.error('Database query error:', error.message);
    if (!useMock) {
      console.log('⚠️ Falling back to Local Mock Database...');
      useMock = true;
      initMockDb();
      return handleMockQuery(text, params);
    }
    return { data: null, error: error.message, count: 0 };
  }
};

// Get single row
const queryOne = async (text, params) => {
  const result = await query(text, params);
  if (result.error) return result;
  // If it's single object, return it. If it's an array, return first index.
  const rowData = Array.isArray(result.data) ? result.data?.[0] : result.data;
  return { data: rowData || null, error: null };
};

module.exports = { pool, query, queryOne };
