import { randomUUID } from 'node:crypto';
import { hashPassword } from '../src/auth.js';
import { encrypt } from '../src/crypto.js';
import { query, pool } from '../src/db.js';
import speakeasy from 'speakeasy';
const [email,password,firstName='Admin',lastName='Mistic Aura',role='super_admin'] = process.argv.slice(2);
if(!email || !password){console.error('Usage: npm run create-admin -- admin@example.com "A-long-unique-password" [First] [Last] [role]');process.exit(1);}
const secret = speakeasy.generateSecret({name:`Mistic Aura (${email})`,length:20});
const hash=await hashPassword(password);const existing=await query('SELECT id FROM admin_users WHERE email=$1',[email]);
if(existing.rows[0]){await query(`UPDATE admin_users SET password_hash=$1,first_name=$2,last_name=$3,role=$4,mfa_enabled=1,mfa_secret_encrypted=$5,updated_at=NOW(3) WHERE id=$6`,[hash,firstName,lastName,role,encrypt(secret.base32),existing.rows[0].id]);}
else{await query(`INSERT INTO admin_users(id,email,password_hash,first_name,last_name,role,mfa_enabled,mfa_secret_encrypted) VALUES($1,$2,$3,$4,$5,$6,1,$7)`,[randomUUID(),email,hash,firstName,lastName,role,encrypt(secret.base32)]);}
console.log('\nAdmin created/updated with MFA enabled.');console.log('Add this TOTP secret to your authenticator app:');console.log(secret.base32);console.log('\nOTPAuth URL:');console.log(secret.otpauth_url);console.log('\nKeep this secret private.');await pool.end();
