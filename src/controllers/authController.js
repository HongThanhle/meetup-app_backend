const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isNonEmptyString } = require('../middleware/validation');
const {
  CODE_TTL_MS,
  MAX_VERIFY_ATTEMPTS,
  createVerificationCode,
  hashVerificationCode,
  getVerificationCodeStatus,
  getResendStatus,
  sendVerificationEmail,
} = require('../services/emailVerificationService');

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function serializeUser(user) {
  return { id: user._id, name: user.name, email: user.email };
}

async function createAndSendVerificationCode(user) {
  const now = new Date();
  const code = createVerificationCode();
  user.emailVerificationCodeHash = hashVerificationCode(code);
  user.emailVerificationExpiresAt = new Date(now.getTime() + CODE_TTL_MS);
  user.emailVerificationSentAt = now;
  user.emailVerificationAttempts = 0;
  user.emailVerificationWindowStartedAt = now;
  user.emailVerificationSendCount = 1;
  await user.save();
  await sendVerificationEmail(user.email, code);
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!isNonEmptyString(name, 80) || !isNonEmptyString(email, 254) || !isNonEmptyString(password, 128)) {
      return res.status(400).json({ error: 'Tên, email hoặc mật khẩu không hợp lệ' });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || password.length < 8) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không hợp lệ' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      emailVerified: false,
    });

    try {
      await createAndSendVerificationCode(user);
    } catch (mailError) {
      await User.deleteOne({ _id: user._id, emailVerified: false });
      console.error('Không gửi được email xác minh:', mailError.message);
      return res.status(503).json({
        error: mailError.code === 'EMAIL_SERVICE_NOT_CONFIGURED'
          ? 'Dịch vụ gửi email xác minh chưa được cấu hình.'
          : 'Chưa gửi được email xác minh. Vui lòng thử lại sau.',
      });
    }

    return res.status(201).json({
      verificationRequired: true,
      email: user.email,
      message: 'Mã xác minh đã được gửi đến email của bạn.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }
    console.error('Lỗi đăng ký:', err);
    return res.status(500).json({ error: 'Lỗi server khi đăng ký' });
  }
}

async function verifyEmail(req, res) {
  try {
    const { email, code } = req.body;
    if (!isNonEmptyString(email, 254) || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Email hoặc mã xác minh không hợp lệ' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Không tìm thấy yêu cầu xác minh cho email này.' });
    }
    if (user.emailVerified) {
      return res.status(400).json({ error: 'Email này đã được xác minh. Bạn có thể đăng nhập.' });
    }

    const status = getVerificationCodeStatus(user, code);
    if (status === 'expired') {
      return res.status(400).json({ error: 'Mã xác minh đã hết hạn. Hãy yêu cầu gửi mã mới.' });
    }
    if (status === 'attempts_exceeded') {
      return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu gửi mã mới.' });
    }
    if (status === 'invalid') {
      user.emailVerificationAttempts += 1;
      await user.save();
      const error = user.emailVerificationAttempts >= MAX_VERIFY_ATTEMPTS
        ? 'Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu gửi mã mới.'
        : 'Mã xác minh không đúng.';
      return res.status(user.emailVerificationAttempts >= MAX_VERIFY_ATTEMPTS ? 429 : 400)
        .json({ error });
    }

    user.emailVerified = true;
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    user.emailVerificationSentAt = null;
    user.emailVerificationAttempts = 0;
    user.emailVerificationWindowStartedAt = null;
    user.emailVerificationSendCount = 0;
    await user.save();

    return res.json({
      token: generateToken(user._id),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('Lỗi xác minh email:', err);
    return res.status(500).json({ error: 'Lỗi server khi xác minh email' });
  }
}

async function resendVerification(req, res) {
  try {
    const { email } = req.body;
    if (!isNonEmptyString(email, 254)) {
      return res.status(400).json({ error: 'Email không hợp lệ' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || user.emailVerified) {
      return res.status(400).json({ error: 'Không có yêu cầu xác minh đang chờ cho email này.' });
    }

    const now = Date.now();
    const resendStatus = getResendStatus(user, now);
    if (!resendStatus.allowed) {
      return res.status(429).json({
        error: `Vui lòng đợi ${resendStatus.retryAfterSeconds} giây trước khi gửi lại mã.`,
        retryAfterSeconds: resendStatus.retryAfterSeconds,
      });
    }

    const previousWindowStartedAt = user.emailVerificationWindowStartedAt?.getTime();
    const windowIsActive = previousWindowStartedAt && now - previousWindowStartedAt < 60 * 60 * 1000;
    const code = createVerificationCode();
    user.emailVerificationCodeHash = hashVerificationCode(code);
    user.emailVerificationExpiresAt = new Date(now + CODE_TTL_MS);
    user.emailVerificationSentAt = new Date(now);
    user.emailVerificationAttempts = 0;
    if (!windowIsActive) {
      user.emailVerificationWindowStartedAt = new Date(now);
      user.emailVerificationSendCount = 0;
    }
    user.emailVerificationSendCount += 1;
    await user.save();

    try {
      await sendVerificationEmail(user.email, code);
    } catch (mailError) {
      console.error('Không gửi được email xác minh:', mailError.message);
      return res.status(503).json({
        error: 'Chưa gửi được email xác minh. Vui lòng thử lại sau.',
      });
    }

    return res.json({ message: 'Mã xác minh mới đã được gửi đến email của bạn.' });
  } catch (err) {
    console.error('Lỗi gửi lại mã xác minh:', err);
    return res.status(500).json({ error: 'Lỗi server khi gửi lại mã xác minh' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!isNonEmptyString(email, 254) || !isNonEmptyString(password, 128)) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không hợp lệ' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    if (user.emailVerified === false) {
      return res.status(403).json({
        error: 'Email chưa được xác minh. Hãy kiểm tra hộp thư để nhập mã xác minh.',
        verificationRequired: true,
        email: user.email,
      });
    }

    return res.json({
      token: generateToken(user._id),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error('Lỗi đăng nhập:', err);
    return res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
}

module.exports = { register, verifyEmail, resendVerification, login };
