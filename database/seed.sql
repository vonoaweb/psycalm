-- PsyCalm — Seed Data (PostgreSQL)
-- Run this AFTER schema.sql in Supabase SQL Editor

-- Fee types
INSERT INTO fee_types (type, label, fee, deposit_percent, duration, color) VALUES
  ('primera_consulta', 'Primera consulta', 800, 20, 60, '#E07050'),
  ('sesion_regular', 'Sesion regular', 600, 20, 50, '#3B82F6'),
  ('sesion_online', 'Sesion online', 500, 15, 45, '#10B981')
ON CONFLICT (type) DO NOTHING;

-- Settings
INSERT INTO settings (key, value) VALUES
  ('practice_name', '{"name": "Consulta de Psicologia Dra. Rodriguez"}'),
  ('practice_description', '{"text": "Atencion psicologica profesional y personalizada"}'),
  ('currency', '{"code": "MXN", "symbol": "$"}'),
  ('deposit_percent_default', '{"percent": 20}'),
  ('welcome_message', '{"text": "Hola! Soy el asistente virtual de la consulta. En que puedo ayudarte?"}'),
  ('schedule', '{"lunes":{"active":true,"start":"09:00","end":"17:00"},"martes":{"active":true,"start":"09:00","end":"17:00"},"miercoles":{"active":true,"start":"09:00","end":"17:00"},"jueves":{"active":true,"start":"09:00","end":"17:00"},"viernes":{"active":true,"start":"09:00","end":"14:00"},"sabado":{"active":false},"domingo":{"active":false}}')
ON CONFLICT (key) DO NOTHING;

-- Sample patients
INSERT INTO patients (name, phone, email, status, notes) VALUES
  ('Maria Garcia', '+525512345678', 'maria@email.com', 'active', 'Ansiedad generalizada'),
  ('Carlos Lopez', '+525598765432', 'carlos@email.com', 'active', 'Terapia cognitiva'),
  ('Ana Martinez', '+525556789012', 'ana@email.com', 'active', 'Primera consulta'),
  ('Luis Hernandez', '+525523456789', 'luis@email.com', 'inactive', 'Sesion completada')
ON CONFLICT (phone) DO NOTHING;

-- Sample appointments
INSERT INTO appointments (patient_name, patient_phone, patient_email, date, time, type, status, fee, deposit_percent, deposit_amount, paid, duration) VALUES
  ('Maria Garcia', '+525512345678', 'maria@email.com', '2026-05-16', '10:00', 'sesion_regular', 'confirmed', 600, 20, 120, true, 50),
  ('Carlos Lopez', '+525598765432', 'carlos@email.com', '2026-05-16', '14:00', 'sesion_regular', 'confirmed', 600, 20, 120, true, 50),
  ('Ana Martinez', '+525556789012', 'ana@email.com', '2026-05-17', '09:00', 'primera_consulta', 'pending', 800, 20, 160, false, 60),
  ('Maria Garcia', '+525512345678', 'maria@email.com', '2026-05-19', '11:00', 'sesion_online', 'confirmed', 500, 15, 75, true, 45),
  ('Roberto Sanchez', '+525534567890', NULL, '2026-05-20', '16:00', 'primera_consulta', 'pending', 800, 20, 160, false, 60);

-- Sample payments
INSERT INTO payments (patient_name, amount, deposit_percent, deposit_amount, status, method) VALUES
  ('Maria Garcia', 120, 20, 120, 'completed', 'stripe'),
  ('Carlos Lopez', 120, 20, 120, 'completed', 'stripe'),
  ('Maria Garcia', 75, 15, 75, 'completed', 'stripe'),
  ('Ana Martinez', 160, 20, 160, 'pending', 'stripe');
