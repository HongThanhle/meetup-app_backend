const PushToken = require('../models/PushToken');

async function registerPushToken(req, res, next) {
  try {
    const { token, platform } = req.body;
    if (typeof token !== 'string' || token.length > 256 || !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)
      || !['ios', 'android'].includes(platform)) {
      return res.status(400).json({ error: 'Push token không hợp lệ' });
    }
    await PushToken.findOneAndUpdate(
      { token },
      { $set: { userId: req.userId, platform } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

async function unregisterPushToken(req, res, next) {
  try {
    const { token } = req.body;
    if (typeof token === 'string') {
      await PushToken.deleteOne({ userId: req.userId, token });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

module.exports = { registerPushToken, unregisterPushToken };
