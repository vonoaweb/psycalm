/**
 * PsyCalm — PostgreSQL Database Client
 * Uses node-postgres (pg) for direct PostgreSQL connection
 * This is faster and more reliable than Supabase REST API for backend
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Supabase
  }
});

// Test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected to Supabase');
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection failed:', err.message);
    console.error('   Check DATABASE_URL in .env file');
    process.exit(1);
  });

// Query helper
const query = async (text, params) => {
  try {
    const result = await pool.query(text, params);
    return { data: result.rows, error: null, count: result.rowCount };
  } catch (error) {
    console.error('Database query error:', error.message);
    return { data: null, error: error.message, count: 0 };
  }
};

// Get single row
const queryOne = async (text, params) => {
  const result = await query(text, params);
  if (result.error) return result;
  return { data: result.data?.[0] || null, error: null };
};

module.exports = { pool, query, queryOne };
