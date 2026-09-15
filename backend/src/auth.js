import argon2 from 'argon2';
import { query } from './db.js';
import { config, cookieOptions, csrfCookieOptions } from './config.js';
import { randomToken, sha256 } from './crypto.js';
import { randomUUID } from 'node:crypto';

export async function hashPassword(password) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash, password) {
  return argon2.verify(hash, password);
}

export function ensureCsrf(request, reply) {
  let token = request.cookies[config.csrfCookieName];
  if (!token) {
    token = randomToken(32);
    reply.setCookie(config.csrfCookieName, token, csrfCookieOptions);
  }
  return token;
}

export function verifyCsrf(request) {
  const cookie = request.cookies[config.csrfCookieName];
  const header = request.headers['x-csrf-token'];
  if (!cookie || !header || cookie.length !== header.length || !timingSafe(cookie, header)) {
    const error = new Error('Invalid CSRF token');
    error.statusCode = 403;
    throw error;
  }
}

function timingSafe(a, b) {
  return Buffer.from(a).length === Buffer.from(b).length && cryptoSafeEqual(a, b);
}
function cryptoSafeEqual(a, b) {
  const crypto = globalThis.crypto;
  // WebCrypto does not expose timingSafeEqual; use a fixed-time-ish byte loop.
  const ab = Buffer.from(a); const bb = Buffer.from(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function createSession({ userId = null, adminUserId = null, request, reply }) {
  const raw = randomToken(48);
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + config.sessionDays * 86400000);
  await query(
    `INSERT INTO sessions (id, user_id, admin_user_id, session_token_hash, ip_address, user_agent, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [randomUUID(), userId, adminUserId, tokenHash, request.ip, request.headers['user-agent'] || null, expiresAt]
  );
  reply.setCookie(config.sessionCookieName, raw, { ...cookieOptions, maxAge: config.sessionDays * 86400 });
  return raw;
}

export async function getSession(request) {
  const raw = request.cookies[config.sessionCookieName];
  if (!raw) return null;
  const { rows } = await query(
    `SELECT s.*, u.email, u.first_name, u.last_name, u.status AS user_status,
            a.email AS admin_email, a.first_name AS admin_first_name, a.last_name AS admin_last_name,
            a.role AS admin_role, a.status AS admin_status
       FROM sessions s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN admin_users a ON a.id = s.admin_user_id
      WHERE s.session_token_hash=$1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()`,
    [sha256(raw)]
  );
  if (!rows[0]) return null;
  await query('UPDATE sessions SET last_used_at=now() WHERE id=$1', [rows[0].id]);
  return rows[0];
}

export async function requireUser(request, reply) {
  const session = await getSession(request);
  if (!session?.user_id || session.user_status !== 'active') {
    reply.code(401).send({ error: 'Authentication required' });
    return null;
  }
  return session;
}

export async function requireAdmin(request, reply, roles = []) {
  const session = await getSession(request);
  if (!session?.admin_user_id || session.admin_status !== 'active') {
    reply.code(401).send({ error: 'Admin authentication required' });
    return null;
  }
  if (roles.length && !roles.includes(session.admin_role)) {
    reply.code(403).send({ error: 'Insufficient permissions' });
    return null;
  }
  return session;
}

export async function revokeSession(request, reply) {
  const raw = request.cookies[config.sessionCookieName];
  if (raw) await query('UPDATE sessions SET revoked_at=now() WHERE session_token_hash=$1', [sha256(raw)]);
  reply.clearCookie(config.sessionCookieName, { ...cookieOptions, maxAge: 0 });
}

export async function revokeUserSessions(userId) {
  await query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);
}
