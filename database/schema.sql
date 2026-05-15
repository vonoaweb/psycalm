-- PsyCalm — Database Schema (PostgreSQL/Supabase)
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Fee types (tarifas configurables)
CREATE TABLE IF NOT EXISTS fee_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_percent INTEGER DEFAULT 20,
  duration INTEGER DEFAULT 60,
  color TEXT DEFAULT '#E07050',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Patients
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID REFERENCES patients(id),
  calcom_booking_id TEXT,
  patient_name TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_email TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration INTEGER DEFAULT 60,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  fee DECIMAL(10,2) DEFAULT 0,
  deposit_percent INTEGER DEFAULT 20,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  stripe_payment_intent_id TEXT,
  paid BOOLEAN DEFAULT FALSE,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id UUID REFERENCES appointments(id),
  patient_name TEXT,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  deposit_percent INTEGER DEFAULT 20,
  deposit_amount DECIMAL(10,2) DEFAULT 0,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'pending',
  date TIMESTAMPTZ DEFAULT NOW(),
  method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bot conversations
CREATE TABLE IF NOT EXISTS bot_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL UNIQUE,
  state TEXT DEFAULT 'idle',
  data JSONB DEFAULT '{}',
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Admins
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
