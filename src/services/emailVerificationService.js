const crypto = require('crypto');
const nodemailer = require('nodemailer');

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function createVerificationCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function hashVerificationCode(code) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET chưa được cấu hình');
  }
  return crypto.createHmac('sha256', secret).update(code).digest('hex');
}

function getVerificationCodeStatus(user, code, now = Date.now()) {
  if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() <= now) {
    return 'expired';
  }
  if (user.emailVerificationAttempts >= MAX_VERIFY_ATTEMPTS) {
    return 'attempts_exceeded';
  }

  const expected = Buffer.from(user.emailVerificationCodeHash || '', 'hex');
  const actual = Buffer.from(hashVerificationCode(code), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return 'invalid';
  }
  return 'valid';
}

function getResendStatus(user, now = Date.now()) {
  const lastSentAt = user.emailVerificationSentAt?.getTime();
  if (lastSentAt && now - lastSentAt < RESEND_COOLDOWN_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - lastSentAt)) / 1000),
    };
  }

  const windowStartedAt = user.emailVerificationWindowStartedAt?.getTime();
  const windowIsActive = windowStartedAt && now - windowStartedAt < RESEND_WINDOW_MS;
  if (windowIsActive && user.emailVerificationSendCount >= MAX_SENDS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((RESEND_WINDOW_MS - (now - windowStartedAt)) / 1000),
    };
  }

  return { allowed: true };
}

async function sendVerificationEmail(email, code) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !Number.isInteger(port) || !user || !pass || !from) {
    const error = new Error('Chưa cấu hình dịch vụ gửi email xác minh');
    error.code = 'EMAIL_SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === 'true'
      : port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Mã xác minh tài khoản Điểm Hẹn',
    text: `Mã xác minh email của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
    html: `<div style="font-family:Arial,sans-serif;color:#18312c;max-width:480px;margin:auto;padding:24px"><h2>Xác minh email</h2><p>Nhập mã này trong ứng dụng Điểm Hẹn để hoàn tất đăng ký:</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#146356;padding:16px 0">${code}</div><p>Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu tạo tài khoản, hãy bỏ qua email này.</p></div>`,
  });
}

module.exports = {
  CODE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  RESEND_WINDOW_MS,
  MAX_SENDS_PER_WINDOW,
  createVerificationCode,
  hashVerificationCode,
  getVerificationCodeStatus,
  getResendStatus,
  sendVerificationEmail,
};
