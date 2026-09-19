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

export async function sendVerificationEmail({ to, firstName, code }) {
  return send({
    to,
    subject: 'Your Mistic Aura verification code',
    text: `Hi ${firstName},

Welcome to Mistic Aura.

Your email verification code is:

${code}

This code expires in 10 minutes.

If you did not create a Mistic Aura account, you can ignore this email.

Mistic Aura`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">
        <p>Hi ${escapeHtml(firstName)},</p>

        <p>Welcome to Mistic Aura.</p>

        <p>Your email verification code is:</p>

        <div style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;">
          ${escapeHtml(code)}
        </div>

        <p>This code expires in <strong>10 minutes</strong>.</p>

        <p>If you did not create a Mistic Aura account, you can ignore this email.</p>

        <p>Mistic Aura</p>
      </div>
    `
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
