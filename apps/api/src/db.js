const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost') && !process.env.DATABASE_URL.includes('127.0.0.1')
    ? { rejectUnauthorized: false }
    : false
});

// Automatically run schema initialization on boot
async function initDb() {
  try {
    const migrationPath = path.join(__dirname, '../../../db/migrations/01_init.up.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await pool.query(sql);
      console.log('[Database] Startup schema migration applied successfully.');
    }
  } catch (err) {
    console.error('[Database] Failed to apply startup migrations:', err.message);
  }
}

initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
