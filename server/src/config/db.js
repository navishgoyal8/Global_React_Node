const mysql = require('mysql2/promise'); // Or 'mysql', depending on what you installed
require('dotenv').config();

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'sales',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;