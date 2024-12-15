require('dotenv').config();
const { Pool } = require('pg');

// Initialize PostgreSQL pool with connection URL from .env
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
});

// Export the pool for use in other files
module.exports = pool;
