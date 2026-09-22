const Location = require('../models/Location');
const Group = require('../models/Group');
const { geocode, reverseGeocode } = require('../services/geocodeService');
const { findCafesNearby } = require('../services/placesService');
const { calculateCentroid, haversineDistance } = require('../services/geoAlgorithm');

// Bước 1 (nhập tay): chỉ geocode để preview, CHƯA lưu DB
async function geocodePreview(req, res) {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Thiếu địa chỉ' });
    }

    const result = await geocode(address);
    if (!result) {
      return res.status(404).json({ error: 'Không tìm được địa chỉ này' });
    }

    res.json(result); // { lat, lng, matchedAddress }
  } catch (err) {
    console.error('Lỗi geocode:', err);
    res.status(500).json({ error: 'Lỗi server khi geocode' });
  }
}

// Dùng cho luồng GPS: có tọa độ rồi, muốn hiện tên địa chỉ dễ đọc thay vì số thô
async function reverseGeocodeAddress(req, res) {
  try {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Thiếu tọa độ' });
    }
    const address = await reverseGeocode(lat, lng);
    if (!address) {
      return res.status(404).json({ error: 'Không tìm được địa chỉ cho tọa độ này' });
    }
    res.json({ address });
  } catch (err) {
    console.error('Lỗi reverse geocode:', err);
    res.status(500).json({ error: 'Lỗi server khi reverse geocode' });
  }
}

// Lưu vị trí thật (cả GPS và manual đều gọi endpoint này với lat/lng đã có sẵn)
async function submitLocation(req, res) {
  try {
    const { groupId } = req.params;
    const { source, lat, lng, address } = req.body;

    if (!source || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin vị trí' });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm' });
    }

    // upsert: nếu user đã gửi vị trí trước đó trong nhóm này, ghi đè thay vì tạo mới
    const location = await Location.findOneAndUpdate(
      { groupId, userId: req.userId },
      { lat, lng, source, rawAddress: source === 'manual' ? address : null },
      { new: true, upsert: true }
    );

    res.json(location);
  } catch (err) {
    console.error('Lỗi lưu vị trí:', err);
    res.status(500).json({ error: 'Lỗi server khi lưu vị trí' });
  }
}

// Tính centroid từ mọi vị trí trong nhóm, tìm quán cà phê quanh đó
async function getSuggestions(req, res) {
  try {
    const { groupId } = req.params;

    const locations = await Location.find({ groupId });
    if (locations.length === 0) {
      return res.status(400).json({ error: 'Chưa có ai gửi vị trí trong nhóm này' });
    }

    const centroid = calculateCentroid(locations);

    const cafes = await findCafesNearby(centroid.lat, centroid.lng, 1500);

    const ranked = cafes
      .map((cafe) => ({
        ...cafe,
        distance: haversineDistance(centroid.lat, centroid.lng, cafe.lat, cafe.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15); // giới hạn top 15 kết quả gần nhất

    res.json({ centroid, suggestions: ranked });
  } catch (err) {
    console.error('Lỗi tính gợi ý:', err);
    res.status(500).json({ error: 'Lỗi server khi tính gợi ý' });
  }
}

module.exports = { geocodePreview, reverseGeocodeAddress, submitLocation, getSuggestions };
