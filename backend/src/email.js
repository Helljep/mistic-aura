import nodemailer from 'nodemailer';
import { config } from './config.js';

let transporter = null;
if (config.smtp.host && config.smtp.user && config.smtp.pass) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass }
  });
  if (transporter) {
  transporter.verify()
    .then(() => {
      console.log('[EMAIL DEBUG] SMTP CONNECTION SUCCESS');
    })
    .catch(error => {
      console.error('[EMAIL DEBUG] SMTP CONNECTION FAILED:', {
        name: error.name,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode,
        message: error.message
      });
    });
} else {
  console.log('[EMAIL DEBUG] SMTP TRANSPORTER NOT CREATED');
}
}

async function send(message) {
  console.log('[EMAIL DEBUG] send() called');
  console.log('[EMAIL DEBUG] SMTP configured:', {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    from: config.smtp.from,
    hasPassword: Boolean(config.smtp.pass)
  });

  if (!transporter) {
    console.log('[EMAIL DEBUG] NO TRANSPORTER CREATED');
    console.log('[EMAIL DEBUG] Recipient:', message.to);
    console.log('[EMAIL DEBUG] Subject:', message.subject);
    return { devMode: true };
  }

  try {
    console.log('[EMAIL DEBUG] Calling transporter.sendMail()');
    console.log('[EMAIL DEBUG] Recipient:', message.to);
    console.log('[EMAIL DEBUG] Subject:', message.subject);

    const result = await transporter.sendMail({
      ...message,
      from: config.smtp.from
    });

    console.log('[EMAIL DEBUG] sendMail SUCCESS:', {
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
      response: result.response,
      envelope: result.envelope
    });

    return result;
  } catch (error) {
    console.error('[EMAIL DEBUG] sendMail FAILED:', {
      name: error.name,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      message: error.message
    });

    throw error;
  }
}

export function verificationUrl(token) {
  const appUrl = config.publicAppUrl.replace(/\/+$/, '');
  return `${appUrl}/verify-email.html?token=${encodeURIComponent(token)}`;
}

export function resetUrl(token) {
  const appUrl = config.publicAppUrl.replace(/\/+$/, '');
  return `${appUrl}/reset-password.html?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail({ to, firstName, token }) {
  const url = verificationUrl(token);
  return send({
    to,
    subject: 'Verify your Mistic Aura email',
    text: `Hi ${firstName},\n\nPlease verify your Mistic Aura email address:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${escapeHtml(firstName)},</p><p>Please verify your Mistic Aura email address.</p><p><a href="${url}">Verify my email</a></p><p>This link expires in 24 hours.</p>`
  });
}

export async function sendPasswordResetEmail({ to, firstName, token }) {
  const url = resetUrl(token);
  return send({
    to,
    subject: 'Reset your Mistic Aura password',
    text: `Hi ${firstName},\n\nReset your password here:\n${url}\n\nThis link expires in 30 minutes.`,
    html: `<p>Hi ${escapeHtml(firstName)},</p><p>You can reset your Mistic Aura password here.</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes.</p>`
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
