import mysql from 'mysql2/promise';
import { config } from './config.js';

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? {} : undefined,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_MAX || 8),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  decimalNumbers: false,
  timezone: 'Z'
});

function convertPlaceholders(text, params = []) {
  // If the query already uses MySQL ? placeholders,
  // pass the parameters through unchanged.
  if (!/\$\d+/.test(text)) {
    return { sql: text, values: params };
  }

  // Convert PostgreSQL-style $1, $2, etc. to MySQL ?
  const values = [];
  const sql = text.replace(/\$(\d+)/g, (_, n) => {
    values.push(params[Number(n) - 1]);
    return '?';
  });

  return { sql, values };
}

export async function query(text, params = []) {
  const { sql, values } = convertPlaceholders(text, params);
  const [rows] = await pool.execute(sql, values);
  return {
    rows: Array.isArray(rows) ? rows : [],
    rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
    result: rows
  };
}

export async function withTransaction(fn) {
  const connection = await pool.getConnection();
  const client = {
    async query(text, params = []) {
      const { sql, values } = convertPlaceholders(text, params);
      const [rows] = await connection.execute(sql, values);
      return {
        rows: Array.isArray(rows) ? rows : [],
        rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
        result: rows
      };
    }
  };
  try {
    await connection.beginTransaction();
    const result = await fn(client);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export { pool };
