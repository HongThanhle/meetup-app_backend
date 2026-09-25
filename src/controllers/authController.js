const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isNonEmptyString } = require('../middleware/validation');

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
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
    const user = await User.create({ name: normalizedName, email: normalizedEmail, password: hashedPassword });

    const token = generateToken(user._id);
    res.status(201).json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Lỗi đăng ký:', err);
    res.status(500).json({ error: 'Lỗi server khi đăng ký' });
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

    const token = generateToken(user._id);
    res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error('Lỗi đăng nhập:', err);
    res.status(500).json({ error: 'Lỗi server khi đăng nhập' });
  }
}

module.exports = { register, login };
