import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ['001_initial.sql', '003_email_verififcation_codes.sql', '004_stock.sql'];

for (const file of files) {
  const sql = await fs.readFile(path.join(here, '../sql/', file), 'utf8');
  const statements = sql.split(/;\s*(?:\r?\n|$)/).map(s => s.trim()).filter(Boolean);
  for (const statement of statements) await pool.query(statement);
  console.log(`Applied ${file}`);
}
console.log('Mistic Aura MySQL database migration complete.');
await pool.end();