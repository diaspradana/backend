const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

let pool;

const dbUri = process.env.MYSQL_URL || process.env.MYSQL_PUBLIC_URL || process.env.DATABASE_URL;

if (dbUri) {
  pool = mysql.createPool({
    uri: dbUri,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: false }
  });
  console.log('Menggunakan DB URI Connection String (Railway/Production)');
} else {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  console.log('Menggunakan konfigurasi database lokal');
}

// Test the connection
pool.getConnection()
  .then(connection => {
    console.log('Successfully connected to MySQL database.');
    connection.release();
  })
  .catch(err => {
    console.error('Error connecting to MySQL database:', err.message);
  });

module.exports = pool;
