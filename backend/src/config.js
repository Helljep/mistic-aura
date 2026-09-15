import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const isProd = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL || '';
const dbSsl = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  appOrigin: process.env.APP_ORIGIN || 'http://localhost:3000',
  publicAppUrl: process.env.PUBLIC_APP_URL || process.env.APP_ORIGIN || 'http://localhost:3000',
  databaseUrl,
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || 'mistic_aura',
    user: process.env.DB_USER || 'mistic_aura',
    password: process.env.DB_PASSWORD || '',
    ssl: dbSsl,
    sslRejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true'
  },
  sessionDays: Number(process.env.SESSION_DAYS || 14),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'mistic_session',
  csrfCookieName: process.env.CSRF_COOKIE_NAME || 'mistic_csrf',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'Mistic Aura <hello@example.com>'
  },
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripeCurrency: (process.env.STRIPE_CURRENCY || 'aud').toLowerCase(),
  supportEmail: process.env.SUPPORT_EMAIL || '',
  encryptionKey: process.env.APP_ENCRYPTION_KEY || '',
  isProd
};

export function encryptionKey() {
  const raw = config.encryptionKey;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is required for admin MFA secret encryption.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

export function ensureProductionSecrets() {
  if (!config.databaseUrl) {
    required('DB_HOST'); required('DB_NAME'); required('DB_USER'); required('DB_PASSWORD');
  }
  if (!isProd) return;
  if (config.appOrigin.startsWith('http://')) throw new Error('APP_ORIGIN must use HTTPS in production.');
  if (config.publicAppUrl.startsWith('http://')) throw new Error('PUBLIC_APP_URL must use HTTPS in production.');
  required('APP_ENCRYPTION_KEY');
}

export const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/'
};

export const csrfCookieOptions = {
  httpOnly: false,
  secure: isProd,
  sameSite: 'lax',
  path: '/'
};
