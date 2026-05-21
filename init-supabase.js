#!/usr/bin/env node
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('verbatim');
}
const { Client } = require('pg');

async function init() {
  console.log('🔧 PsyCalm — Database Initialization\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set!');
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  await client.connect();
  console.log('✅ Connected to PostgreSQL\n');

  console.log('📊 Creating tables...');

  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS fee_types (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      type TEXT UNIQUE NOT NULL, label TEXT NOT NULL,
      fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      deposit_percent INTEGER DEFAULT 20,
      duration INTEGER DEFAULT 60, color TEXT DEFAULT '#2D8B6F',
      active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ fee_types');

  await client.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL,
      email TEXT, status TEXT DEFAULT 'active',
      notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ patients');

  await client.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      patient_id UUID REFERENCES patients(id),
      calcom_booking_id TEXT, patient_name TEXT NOT NULL,
      patient_phone TEXT NOT NULL, patient_email TEXT,
      date DATE NOT NULL, time TIME NOT NULL,
      duration INTEGER DEFAULT 60, type TEXT NOT NULL,
      status TEXT DEFAULT 'pending', notes TEXT,
      fee DECIMAL(10,2) DEFAULT 0,
      deposit_percent INTEGER DEFAULT 20,
      deposit_amount DECIMAL(10,2) DEFAULT 0,
      stripe_payment_intent_id TEXT,
      paid BOOLEAN DEFAULT FALSE, payment_method TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ appointments');

  await client.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      appointment_id UUID REFERENCES appointments(id),
      patient_name TEXT, amount DECIMAL(10,2) NOT NULL DEFAULT 0,
      deposit_percent INTEGER DEFAULT 20,
      deposit_amount DECIMAL(10,2) DEFAULT 0,
      stripe_session_id TEXT, status TEXT DEFAULT 'pending',
      date TIMESTAMPTZ DEFAULT NOW(), method TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ payments');

  await client.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      key TEXT UNIQUE NOT NULL,
      value JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ settings');

  await client.query(`
    CREATE TABLE IF NOT EXISTS bot_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone TEXT NOT NULL UNIQUE, state TEXT DEFAULT 'idle',
      data JSONB DEFAULT '{}',
      last_interaction TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ bot_conversations');

  await client.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('   ✅ admins');

  console.log('\n🌱 Seeding data...');

  await client.query(`
    INSERT INTO fee_types (type, label, fee, deposit_percent, duration, color) VALUES
      ('primera_consulta', 'Primera consulta', 800, 20, 60, '#2D8B6F'),
      ('sesion_regular', 'Sesion regular', 600, 20, 50, '#3B82F6'),
      ('sesion_online', 'Sesion online', 500, 15, 45, '#10B981')
    ON CONFLICT (type) DO NOTHING;
  `);
  console.log('   ✅ fee_types seeded');

  await client.query(`
    INSERT INTO settings (key, value) VALUES
      ('practice_name', '{"name": "Consulta de Psicologia"}'),
      ('currency', '{"code": "MXN", "symbol": "$"}'),
      ('deposit_percent_default', '{"percent": 20}')
    ON CONFLICT (key) DO NOTHING;
  `);
  console.log('   ✅ settings seeded');

  await client.query(`
    INSERT INTO patients (name, phone, email, status, notes) VALUES
      ('Maria Garcia', '+525512345678', 'maria@email.com', 'active', 'Ansiedad generalizada'),
      ('Carlos Lopez', '+525598765432', 'carlos@email.com', 'active', 'Terapia cognitiva'),
      ('Ana Martinez', '+525556789012', 'ana@email.com', 'active', 'Primera consulta')
    ON CONFLICT (phone) DO NOTHING;
  `);
  console.log('   ✅ patients seeded');

  await client.query(`
    INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, paid, duration) VALUES
      ('Maria Garcia', '+525512345678', 'maria@email.com', '2026-05-16', '10:00', 'sesion_regular', 'confirmed', 600, 20, 120, true, 50),
      ('Carlos Lopez', '+525598765432', 'carlos@email.com', '2026-05-16', '14:00', 'sesion_regular', 'confirmed', 600, 20, 120, true, 50),
      ('Ana Martinez', '+525556789012', 'ana@email.com', '2026-05-17', '09:00', 'primera_consulta', 'pending', 800, 20, 160, false, 60)
    ON CONFLICT DO NOTHING;
  `);
  console.log('   ✅ appointments seeded');

  await client.query(`
    INSERT INTO admins (email, password_hash, full_name) VALUES
      ('admin@aparta.mx', 'd833dc02bdc7cc0006302c781e7dda7758ca6d500c779fac9941a913467613c2', 'Administrador')
    ON CONFLICT (email) DO NOTHING;
  `);
  console.log('   ✅ admin seeded');

  await client.end();
  console.log('\n✅ Database ready!');
}

if (require.main === module) init();
module.exports = { init };
