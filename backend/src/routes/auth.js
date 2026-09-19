import { z } from 'zod';
import { randomUUID, createHash, randomInt } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { getSession, hashPassword, verifyPassword, createSession, revokeSession, revokeUserSessions, ensureCsrf, verifyCsrf } from '../auth.js';
import { randomToken, sha256 } from '../crypto.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.js';

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hashVerificationCode(code) {
  return createHash('sha256').update(String(code)).digest('hex');
}

function generateVerificationCode() {
  return String(randomInt(100000, 1000000));
}

/**
 * Invalidates any outstanding codes for the user, issues a fresh one and emails it.
 * Used by both registration and resend so the two paths cannot drift apart.
 */
async function issueVerificationCode({ userId, email, firstName }) {
  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);

  await query(
    `UPDATE email_verification_codes
        SET used_at = NOW(3)
      WHERE user_id = $1
        AND used_at IS NULL`,
    [userId]
  );

  await query(
    `INSERT INTO email_verification_codes (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, DATE_ADD(NOW(3), INTERVAL ${CODE_TTL_MINUTES} MINUTE))`,
    [randomUUID(), userId, codeHash]
  );

  await sendVerificationEmail({ to: email, firstName, code });
}

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(200),
  marketingOptIn: z.boolean().optional().default(false)
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200)
});

const emailOnlySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320)
});

const verifyCodeSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/)
});

const genericResetResponse = () => ({ message: 'If an account exists for that email, we have sent a password reset link.' });
const genericResendResponse = () => ({ message: 'If your account still needs verification, a new code is on its way.' });

export default async function authRoutes(app) {
  app.get('/api/auth/csrf', async (request, reply) => ({ csrfToken: ensureCsrf(request, reply) }));

  app.post('/api/auth/register', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request, reply) => {
    verifyCsrf(request);
    const body = registerSchema.parse(request.body);

    const existing = await query('SELECT id,status FROM users WHERE email=$1', [body.email]);
    if (existing.rows[0] && existing.rows[0].status !== 'deleted') {
      return reply.code(409).send({ error: 'An account already exists for this email.' });
    }

    const passwordHash = await hashPassword(body.password);
    const userId = randomUUID();

    await query(
      `INSERT INTO users(id,email,password_hash,first_name,last_name,marketing_opt_in,marketing_opt_in_at)
       VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6=1 THEN NOW(3) ELSE NULL END)`,
      [userId, body.email, passwordHash, body.firstName, body.lastName, body.marketingOptIn ? 1 : 0]
    );

    if (body.marketingOptIn) {
      await query(
        `INSERT INTO marketing_consents(id,user_id,email,opted_in,source,ip_address,user_agent)
         VALUES($1,$2,$3,1,'signup',$4,$5)`,
        [randomUUID(), userId, body.email, request.ip, request.headers['user-agent'] || null]
      );
    }

    await issueVerificationCode({ userId, email: body.email, firstName: body.firstName });

    return reply.code(201).send({
      message: `We have sent a 6-digit verification code to ${body.email}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      email: body.email
    });
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    verifyCsrf(request);
    const body = loginSchema.parse(request.body);

    const result = await query('SELECT * FROM users WHERE email=$1', [body.email]);
    const user = result.rows[0];
    const valid = user ? await verifyPassword(user.password_hash, body.password).catch(() => false) : false;

    if (!valid || user.status !== 'active') {
      return reply.code(401).send({ error: 'Email or password is incorrect.' });
    }

    if (!user.email_verified_at) {
      return reply.code(403).send({
        error: 'Please verify your email before signing in.',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email
      });
    }

    await query('UPDATE users SET last_login_at=NOW(3),updated_at=NOW(3) WHERE id=$1', [user.id]);
    await createSession({ userId: user.id, request, reply });

    return { user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name } };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    verifyCsrf(request);
    await revokeSession(request, reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request, reply) => {
    const s = await getSession(request);
    if (!s?.user_id) return reply.code(401).send({ error: 'Authentication required' });
    return { user: { id: s.user_id, email: s.email, firstName: s.first_name, lastName: s.last_name } };
  });

  app.post('/api/auth/resend-verification', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    verifyCsrf(request);
    const body = emailOnlySchema.parse(request.body);

    const r = await query(
      'SELECT id,email,first_name,status,email_verified_at FROM users WHERE email=$1',
      [body.email]
    );
    const user = r.rows[0];

    // Always return the same message so the endpoint cannot be used to enumerate accounts.
    if (!user || user.status !== 'active' || user.email_verified_at) {
      return genericResendResponse();
    }

    await issueVerificationCode({ userId: user.id, email: user.email, firstName: user.first_name });
    return genericResendResponse();
  });

  app.post('/api/auth/verify-email', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request) => {
    verifyCsrf(request);
    const body = verifyCodeSchema.parse(request.body);

    const userResult = await query(
      'SELECT id, status, email_verified_at FROM users WHERE email=$1',
      [body.email]
    );
    const user = userResult.rows[0];

    if (!user || user.status !== 'active') {
      throw httpError(400, 'Invalid or expired verification code.');
    }

    if (user.email_verified_at) {
      return { message: 'Your email is already verified. You can sign in.', alreadyVerified: true };
    }

    const codeResult = await query(
      `SELECT id, code_hash, expires_at, attempts
         FROM email_verification_codes
        WHERE user_id = $1
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [user.id]
    );
    const verification = codeResult.rows[0];

    if (!verification) {
      throw httpError(400, 'Invalid or expired verification code. Please request a new code.');
    }

    if (new Date(verification.expires_at).getTime() < Date.now()) {
      throw httpError(400, 'This verification code has expired. Please request a new code.');
    }

    if (Number(verification.attempts) >= MAX_CODE_ATTEMPTS) {
      throw httpError(429, 'Too many incorrect attempts. Please request a new code.');
    }

    if (hashVerificationCode(body.code) !== verification.code_hash) {
      await query(
        'UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id=$1',
        [verification.id]
      );
      throw httpError(400, 'Invalid verification code.');
    }

    await withTransaction(async (client) => {
      await client.query(
        'UPDATE email_verification_codes SET used_at = NOW(3) WHERE id=$1 AND used_at IS NULL',
        [verification.id]
      );
      await client.query(
        'UPDATE users SET email_verified_at = NOW(3), updated_at = NOW(3) WHERE id=$1 AND email_verified_at IS NULL',
        [user.id]
      );
    });

    return { message: 'Your email has been verified. You can now sign in.', verified: true };
  });

  app.post('/api/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (request) => {
    verifyCsrf(request);
    const b = emailOnlySchema.parse(request.body);
    const r = await query('SELECT id,first_name,email,status FROM users WHERE email=$1', [b.email]);

    if (r.rows[0]?.status === 'active') {
      const token = randomToken(32);
      await query('UPDATE password_resets SET used_at=NOW(3) WHERE user_id=$1 AND used_at IS NULL', [r.rows[0].id]);
      await query(
        'INSERT INTO password_resets(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,DATE_ADD(NOW(3), INTERVAL 30 MINUTE))',
        [randomUUID(), r.rows[0].id, sha256(token)]
      );
      await sendPasswordResetEmail({ to: r.rows[0].email, firstName: r.rows[0].first_name, token });
    }

    return genericResetResponse();
  });

  app.post('/api/auth/reset-password', async (request, reply) => {
    verifyCsrf(request);
    const b = z.object({
      token: z.string().min(20).max(200),
      password: z.string().min(12).max(200)
    }).parse(request.body);

    const r = await query(
      'SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW(3)',
      [sha256(b.token)]
    );
    if (!r.rows[0]) return reply.code(400).send({ error: 'This reset link is invalid or has expired.' });

    await query('UPDATE users SET password_hash=$1,updated_at=NOW(3) WHERE id=$2', [await hashPassword(b.password), r.rows[0].user_id]);
    await query('UPDATE password_resets SET used_at=NOW(3) WHERE id=$1', [r.rows[0].id]);
    await revokeUserSessions(r.rows[0].user_id);

    return { message: 'Password updated. Please sign in again.' };
  });
}