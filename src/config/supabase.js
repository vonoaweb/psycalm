/**
 * Supabase client wrapper
 * For direct PostgreSQL queries, use src/config/database.js
 * This file provides backward compatibility and auth features
 */

const { query, queryOne } = require('./database');

// Wrapper that mimics Supabase client API
const supabase = {
  from: (table) => ({
    select: (columns = '*') => ({
      eq: (col, val) => ({
        order: (col, { ascending = true } = {}) => ({
          single: async () => queryOne(`SELECT ${columns} FROM ${table} WHERE ${col} = $1 ORDER BY ${col} ${ascending ? 'ASC' : 'DESC'} LIMIT 1`, [val]),
          then: async () => query(`SELECT ${columns} FROM ${table} WHERE ${col} = $1 ORDER BY ${col} ${ascending ? 'ASC' : 'DESC'}`, [val])
        }),
        single: async () => queryOne(`SELECT ${columns} FROM ${table} WHERE ${col} = $1 LIMIT 1`, [val]),
        limit: (n) => query(`SELECT ${columns} FROM ${table} WHERE ${col} = $1 LIMIT $2`, [val, n]),
        then: async () => query(`SELECT ${columns} FROM ${table} WHERE ${col} = $1`, [val])
      }),
      order: (col, { ascending = true } = {}) => query(`SELECT ${columns} FROM ${table} ORDER BY ${col} ${ascending ? 'ASC' : 'DESC'}`),
      limit: (n) => query(`SELECT ${columns} FROM ${table} LIMIT $1`, [n]),
      then: async () => query(`SELECT ${columns} FROM ${table}`)
    }),
    insert: (rows) => ({
      select: (options = {}) => {
        if (!Array.isArray(rows)) rows = [rows];
        const cols = Object.keys(rows[0]);
        const placeholders = rows.map((_, i) => '(' + cols.map((_, j) => `$${i * cols.length + j + 1}`).join(',') + ')').join(',');
        const values = rows.flatMap(r => cols.map(c => r[c]));
        return query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${placeholders} RETURNING *`, values);
      }
    }),
    update: (data) => ({
      eq: (col, val) => query(`UPDATE ${table} SET ${Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(',')} WHERE ${col} = $${Object.keys(data).length + 1} RETURNING *`, [...Object.values(data), val])
    }),
    upsert: (data, { onConflict }) => ({
      then: async () => {
        if (!Array.isArray(data)) data = [data];
        const results = [];
        for (const row of data) {
          const conflictCol = onConflict;
          const cols = Object.keys(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
          const updateSet = cols.map(c => `${c} = EXCLUDED.${c}`).join(',');
          const result = await query(
            `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSet} RETURNING *`,
            cols.map(c => row[c])
          );
          results.push(result);
        }
        return results[0];
      }
    })
  })
};

module.exports = { supabase, query, queryOne };
