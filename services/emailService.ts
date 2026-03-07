/**
 * Send OTP email via Gmail SMTP. Requires SMTP_USER, SMTP_PASS (app password), SMTP_FROM (optional).
 * Uses templates/email-otp.html when available.
 */
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import logger from '../config/logger';

let transporter: nodemailer.Transporter | null = null;
let otpTemplateHtml: string | null = null;

function getOtpTemplateHtml(): string {
  if (otpTemplateHtml !== null) return otpTemplateHtml;
  try {
    const templatePath = path.join(__dirname, '..', 'templates', 'email-otp.html');
    otpTemplateHtml = fs.readFileSync(templatePath, 'utf8');
  } catch (err) {
    logger.warn('Could not load email-otp.html template', { error: (err as Error).message });
    otpTemplateHtml = '';
  }
  return otpTemplateHtml;
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT ?? '', 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
  return transporter;
}

export interface SendOtpResult {
  sent: boolean;
  error?: string;
}

/**
 * Send OTP to email. Returns { sent: true } or { sent: false, error: string }.
 */
export async function sendOtpEmail(to: string, otp: string): Promise<SendOtpResult> {
  const t = getTransporter();
  if (!t) {
    logger.warn('Email service not configured (SMTP_USER/SMTP_PASS missing)');
    return { sent: false, error: 'Email service not configured' };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const subject = process.env.SMTP_OTP_SUBJECT || 'Your verification code';
  const text = `Your verification code is: ${otp}. It is valid for 10 minutes. If you did not request this, please ignore.`;
  const template = getOtpTemplateHtml();
  const html = template
    ? template.replace(/\{\{OTP_CODE\}\}/g, otp)
    : `<p>Your verification code is: <strong>${otp}</strong>.</p><p>It is valid for 10 minutes.</p><p>If you did not request this, please ignore this email.</p>`;
  try {
    await t.sendMail({
      from: from ?? undefined,
      to: String(to).trim(),
      subject,
      text,
      html
    });
    return { sent: true };
  } catch (err) {
    logger.error('Failed to send OTP email', { to: to ? '***' : null, error: (err as Error).message });
    return { sent: false, error: (err as Error).message };
  }
}

export function isConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}
