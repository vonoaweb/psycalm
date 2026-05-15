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

// Connection test (non-fatal)
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected');
    client.release();
  })
  .catch(err => {
    console.error('⚠️  PostgreSQL not connected:', err.message);
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
