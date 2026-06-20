import crypto from "crypto";
import bcrypt from "bcryptjs";

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;

function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

function detectContactChannel(contact) {
  return /\S+@\S+\.\S+/.test(contact) ? "email" : "sms";
}

async function hashOtpCode(code) {
  return bcrypt.hash(code, 10);
}

async function verifyOtpCodeHash(code, hash) {
  return bcrypt.compare(code, hash);
}

let _mailer = null;
async function getSmtpMailer() {
  if (_mailer) return _mailer;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = await import("nodemailer");
  _mailer = nodemailer.default.createTransport({
    host: process.env.SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return _mailer;
}

async function sendEmailOtp(toEmail, code) {
  const mailer = await getSmtpMailer();
  if (!mailer) {
    console.log(`[OTP-DEV] SMTP not configured. Code for ${toEmail}: ${code}`);
    return { delivered: false, dev: true };
  }
  await mailer.sendMail({
    from: process.env.SMTP_FROM || "no-reply@cannamatch.co",
    to: toEmail,
    subject: "קוד האימות שלך — CannaMatch",
    text: `קוד האימות שלך: ${code}\nתקף ל-${OTP_TTL_MIN} דקות.`,
  });
  return { delivered: true, dev: false };
}

let _twilioClient = null;
async function getTwilioSmsClient() {
  if (_twilioClient) return _twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  try {
    const twilio = await import("twilio");
    _twilioClient = twilio.default(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    return _twilioClient;
  } catch {
    return null;
  }
}

async function sendSmsOtp(toPhone, code) {
  const client = await getTwilioSmsClient();
  if (!client) {
    console.log(`[OTP-DEV] Twilio not configured. Code for ${toPhone}: ${code}`);
    return { delivered: false, dev: true };
  }
  await client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to: toPhone,
    body: `קוד האימות שלך ל-CannaMatch: ${code}`,
  });
  return { delivered: true, dev: false };
}

async function dispatchOtp(contact, code) {
  const channel = detectContactChannel(contact);
  const result = channel === "email"
    ? await sendEmailOtp(contact, code)
    : await sendSmsOtp(contact, code);
  return { channel, ...result };
}

export {
  OTP_TTL_MIN,
  MAX_ATTEMPTS,
  generateOtpCode,
  detectContactChannel,
  hashOtpCode,
  verifyOtpCodeHash,
  dispatchOtp,
};
