function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Không tìm thấy API này' });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  console.error('Unhandled request error:', error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  const message = status === 413
    ? 'Dữ liệu gửi lên quá lớn'
    : status < 500
      ? error.message
      : 'Lỗi máy chủ. Vui lòng thử lại sau.';
  res.status(status).json({ error: message });
}

module.exports = { notFoundHandler, errorHandler };
