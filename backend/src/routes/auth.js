import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { getSession, hashPassword, verifyPassword, createSession, revokeSession, revokeUserSessions, ensureCsrf, verifyCsrf } from '../auth.js';
import { randomToken, sha256 } from '../crypto.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.js';

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(200),
  marketingOptIn: z.boolean().optional().default(false)
});
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
const genericResetResponse = () => ({ message: 'If an account exists for that email, we have sent a password reset link.' });

export default async function authRoutes(app) {
  app.get('/api/auth/csrf', async (request, reply) => ({ csrfToken: ensureCsrf(request, reply) }));

  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    verifyCsrf(request);
    const body = registerSchema.parse(request.body);
    const existing = await query('SELECT id,status FROM users WHERE email=$1', [body.email]);
    if (existing.rows[0] && existing.rows[0].status !== 'deleted') return reply.code(409).send({ error: 'An account already exists for this email.' });

    const passwordHash = await hashPassword(body.password);
    const userId = randomUUID();
    await query(`INSERT INTO users(id,email,password_hash,first_name,last_name,marketing_opt_in,marketing_opt_in_at)
      VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6=1 THEN NOW(3) ELSE NULL END)`, [userId,body.email,passwordHash,body.firstName,body.lastName,body.marketingOptIn ? 1 : 0]);
    const user = await query('SELECT id,email,first_name,last_name,marketing_opt_in FROM users WHERE id=$1',[userId]);
    const token=randomToken(32);
    await query(`INSERT INTO email_verifications(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,DATE_ADD(NOW(3), INTERVAL 24 HOUR))`,[randomUUID(),userId,sha256(token)]);
    if(body.marketingOptIn) await query(`INSERT INTO marketing_consents(id,user_id,email,opted_in,source,ip_address,user_agent) VALUES($1,$2,$3,1,'account_signup',$4,$5)`,[randomUUID(),userId,body.email,request.ip,request.headers['user-agent']||null]);
    await sendVerificationEmail({to:body.email,firstName:body.firstName,token});
    return reply.code(201).send({user:user.rows[0],emailVerificationRequired:true});
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    verifyCsrf(request);
    const body=loginSchema.parse(request.body);
    const result=await query('SELECT * FROM users WHERE email=$1',[body.email]);
    const user=result.rows[0];
    const valid=user?await verifyPassword(user.password_hash,body.password).catch(()=>false):false;
    if(!valid || user.status!=='active') return reply.code(401).send({error:'Email or password is incorrect.'});
    if(!user.email_verified_at) return reply.code(403).send({error:'Please verify your email before signing in.',code:'EMAIL_NOT_VERIFIED'});
    await query('UPDATE users SET last_login_at=NOW(3),updated_at=NOW(3) WHERE id=$1',[user.id]);
    await createSession({userId:user.id,request,reply});
    return {user:{id:user.id,email:user.email,firstName:user.first_name,lastName:user.last_name}};
  });

  app.post('/api/auth/logout', async (request,reply)=>{verifyCsrf(request);await revokeSession(request,reply);return {ok:true};});
  app.get('/api/auth/me', async (request,reply)=>{const s=await getSession(request);if(!s?.user_id)return reply.code(401).send({error:'Authentication required'});return {user:{id:s.user_id,email:s.email,firstName:s.first_name,lastName:s.last_name}};});

  app.post('/api/auth/resend-verification', async (request)=>{
    verifyCsrf(request);
    const b=z.object({email:z.string().trim().toLowerCase().email()}).parse(request.body);
    const r=await query('SELECT id,first_name,email,email_verified_at,status FROM users WHERE email=$1',[b.email]);
    if(!r.rows[0]||r.rows[0].status!=='active'||r.rows[0].email_verified_at)return {message:'If your account needs verification, a new email has been sent.'};
    const token=randomToken(32);
    await query('UPDATE email_verifications SET used_at=NOW(3) WHERE user_id=$1 AND used_at IS NULL',[r.rows[0].id]);
    await query(`INSERT INTO email_verifications(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,DATE_ADD(NOW(3), INTERVAL 24 HOUR))`,[randomUUID(),r.rows[0].id,sha256(token)]);
    await sendVerificationEmail({to:r.rows[0].email,firstName:r.rows[0].first_name,token});
    return {message:'If your account needs verification, a new email has been sent.'};
  });

  app.post('/api/auth/verify-email', async (request,reply)=>{
    verifyCsrf(request);
    const b=z.object({token:z.string().min(20).max(200)}).parse(request.body);
    const r=await query(`SELECT ev.id,ev.user_id FROM email_verifications ev WHERE ev.token_hash=$1 AND ev.used_at IS NULL AND ev.expires_at>NOW(3)`,[sha256(b.token)]);
    if(!r.rows[0])return reply.code(400).send({error:'This verification link is invalid or has expired.'});
    await query('UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW(3)),updated_at=NOW(3) WHERE id=$1',[r.rows[0].user_id]);
    await query('UPDATE email_verifications SET used_at=NOW(3) WHERE id=$1',[r.rows[0].id]);
    return {message:'Your email has been verified. You can now sign in.'};
  });

  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request)=>{
    verifyCsrf(request);
    const b=z.object({email:z.string().trim().toLowerCase().email()}).parse(request.body);
    const r=await query('SELECT id,first_name,email,status FROM users WHERE email=$1',[b.email]);
    if(r.rows[0]?.status==='active'){
      const token=randomToken(32);
      await query('UPDATE password_resets SET used_at=NOW(3) WHERE user_id=$1 AND used_at IS NULL',[r.rows[0].id]);
      await query(`INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,DATE_ADD(NOW(3), INTERVAL 30 MINUTE))`,[randomUUID(),r.rows[0].id,sha256(token)]);
      await sendPasswordResetEmail({to:r.rows[0].email,firstName:r.rows[0].first_name,token});
    }
    return genericResetResponse();
  });

  app.post('/api/auth/reset-password', async (request,reply)=>{
    verifyCsrf(request);
    const b=z.object({token:z.string().min(20).max(200),password:z.string().min(12).max(200)}).parse(request.body);
    const r=await query('SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW(3)',[sha256(b.token)]);
    if(!r.rows[0])return reply.code(400).send({error:'This reset link is invalid or has expired.'});
    await query('UPDATE users SET password_hash=$1,updated_at=NOW(3) WHERE id=$2',[await hashPassword(b.password),r.rows[0].user_id]);
    await query('UPDATE password_resets SET used_at=NOW(3) WHERE id=$1',[r.rows[0].id]);
    await revokeUserSessions(r.rows[0].user_id);
    return {message:'Password updated. Please sign in again.'};
  });
}
