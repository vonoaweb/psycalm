#!/usr/bin/env node
/**
 * PsyCalm — Initialize database (run once on first deploy)
 * Creates tables and seeds data
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function init() {
  console.log('🔧 PsyCalm — Database Initialization\n');
  
  let client;
  try {
    const { Client } = require('pg');
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('✅ Connected to PostgreSQL\n');
  } catch (err) {
    console.error('❌ Cannot connect:', err.message);
    console.log('   Make sure DATABASE_URL is set in .env');
    process.exit(1);
  }

  try {
    // Run schema
    const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
    console.log('📊 Creating tables...');
    await client.query(schema);
    console.log('   ✅ Tables created\n');

    // Run seed
    const seed = fs.readFileSync(path.join(__dirname, 'database', 'seed.sql'), 'utf8');
    console.log('🌱 Seeding data...');
    await client.query(seed);
    console.log('   ✅ Data seeded\n');

    await client.end();
    console.log('✅ Database ready!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    await client.end();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  init();
}

module.exports = { init };
