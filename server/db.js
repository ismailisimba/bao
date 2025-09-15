//require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: false, // Basic example, REVIEW SSL needs!
    // Recommended settings for pool
    max: 10, // Max connections
    idleTimeoutMillis: 30000, // Close idle clients after 30s
    connectionTimeoutMillis: 5000
});




// A simple query function to export
module.exports = {
  query: (text, params) => pool.query(text, params),
};
