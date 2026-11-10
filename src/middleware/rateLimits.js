const { rateLimit } = require('express-rate-limit');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Quá nhiều yêu cầu đăng nhập/đăng ký. Vui lòng thử lại sau 15 phút.' },
});

const joinGroupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Bạn đã thử quá nhiều mã mời. Vui lòng thử lại sau 15 phút.' },
});

const createGroupRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Bạn đã tạo quá nhiều nhóm. Vui lòng thử lại sau.' },
});

const deleteAccountRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Bạn đã thử xóa tài khoản quá nhiều lần. Vui lòng thử lại sau.' },
});

const expensiveRequestRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau một phút.' },
});

module.exports = {
  authRateLimit,
  joinGroupRateLimit,
  createGroupRateLimit,
  deleteAccountRateLimit,
  expensiveRequestRateLimit,
};
