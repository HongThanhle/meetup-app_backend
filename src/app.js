const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const geocodeRoutes = require('./routes/geocodeRoutes');
const reverseGeocodeRoutes = require('./routes/reverseGeocodeRoutes');


const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Meetup backend đang chạy' });
});

app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/geocode-preview', geocodeRoutes);
app.use('/reverse-geocode', reverseGeocodeRoutes);

module.exports = app;
