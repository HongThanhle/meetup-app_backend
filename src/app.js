const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const reverseGeocodeRoutes = require('./routes/reverseGeocodeRoutes');
const friendRoutes = require('./routes/friendRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');


const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean);

// The deployed API sits behind one reverse proxy; use the forwarded client IP for rate limits.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin không được phép truy cập API'));
  },
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(express.json({ limit: '64kb' }));

app.get('/', (req, res) => {
  res.json({ message: 'Meetup backend đang chạy' });
});

app.get('/healthz', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
});

app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/friends', friendRoutes);
app.use('/notifications', notificationRoutes);
app.use('/geocode-preview', geocodeRoutes);
app.use('/reverse-geocode', reverseGeocodeRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
