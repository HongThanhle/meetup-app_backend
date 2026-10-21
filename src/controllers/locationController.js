const Location = require('../models/Location');
const Group = require('../models/Group');
const Vote = require('../models/Vote');
const { geocode, reverseGeocode } = require('../services/geocodeService');
const { findPlacesNearby } = require('../services/placesService');
const {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  normalizePlaceCategories,
  getPlaceSearchRadius,
} = require('../services/placeCategories');
const { getMotorcycleRoute } = require('../services/routingService');
const { calculateCentroid, haversineDistance } = require('../services/geoAlgorithm');
const { isNonEmptyString, isValidCoordinate } = require('../middleware/validation');

// Bước 1 (nhập tay): chỉ geocode để preview, CHƯA lưu DB
async function geocodePreview(req, res) {
  try {
    const { address } = req.body;
    if (!isNonEmptyString(address, 500)) {
      return res.status(400).json({ error: 'Địa chỉ không hợp lệ' });
    }

    const candidates = await geocode(address);
    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Không tìm được địa chỉ này' });
    }

    res.json({ candidates });
  } catch (err) {
    console.error('Lỗi geocode:', err);
    if (err.code === 'GEOCODING_UNAVAILABLE') {
      return res.status(503).json({ error: 'Dịch vụ tìm địa chỉ đang tạm thời không khả dụng.' });
    }
    res.status(500).json({ error: 'Lỗi server khi geocode' });
  }
}

// Dùng cho luồng GPS: có tọa độ rồi, muốn hiện tên địa chỉ dễ đọc thay vì số thô
async function reverseGeocodeAddress(req, res) {
  try {
    const { lat, lng } = req.body;
    if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
      return res.status(400).json({ error: 'Tọa độ không hợp lệ' });
    }
    const address = await reverseGeocode(lat, lng);
    if (!address) {
      return res.status(404).json({ error: 'Không tìm được địa chỉ cho tọa độ này' });
    }
    res.json({ address });
  } catch (err) {
    console.error('Lỗi reverse geocode:', err);
    if (err.code === 'GEOCODING_UNAVAILABLE') {
      return res.status(503).json({ error: 'Dịch vụ tìm địa chỉ đang tạm thời không khả dụng.' });
    }
    res.status(500).json({ error: 'Lỗi server khi reverse geocode' });
  }
}

// Lưu vị trí thật (cả GPS và manual đều gọi endpoint này với lat/lng đã có sẵn)
async function submitLocation(req, res) {
  try {
    const { groupId } = req.params;
    const { source, lat, lng, address } = req.body;

    if (!['gps', 'manual'].includes(source) || !isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
      return res.status(400).json({ error: 'Thông tin vị trí không hợp lệ' });
    }

    if (source === 'manual' && !isNonEmptyString(address, 500)) {
      return res.status(400).json({ error: 'Địa chỉ không hợp lệ' });
    }

    // upsert: nếu user đã gửi vị trí trước đó trong nhóm này, ghi đè thay vì tạo mới
    const location = await Location.findOneAndUpdate(
      { groupId, userId: req.userId },
      { lat, lng, source, rawAddress: source === 'manual' ? address.trim() : null },
      { new: true, upsert: true }
    );

    res.json(location);
  } catch (err) {
    console.error('Lỗi lưu vị trí:', err);
    res.status(500).json({ error: 'Lỗi server khi lưu vị trí' });
  }
}

// Tính centroid từ mọi vị trí trong nhóm, tìm địa điểm phù hợp quanh đó
async function getSuggestions(req, res) {
  try {
    const { groupId } = req.params;
    const memberIds = req.group.members
      .map((member) => member.userId)
      .filter(Boolean);
    const locations = await Location.find({
      groupId,
      userId: { $in: memberIds },
    });
    const submittedIds = new Set(locations.map((location) => String(location.userId)));
    const missingCount = memberIds.filter((memberId) => !submittedIds.has(String(memberId))).length;
    if (missingCount > 0) {
      const submittedCount = memberIds.length - missingCount;
      return res.status(409).json({
        error: `Chưa đủ vị trí để tìm gợi ý (${submittedCount}/${memberIds.length} thành viên đã gửi).`,
      });
    }

    const centroid = calculateCentroid(locations);

    const storedCategories = req.group.placeCategories?.length
      ? req.group.placeCategories
      : DEFAULT_PLACE_CATEGORIES;
    const placeCategories = normalizePlaceCategories(storedCategories);
    if (JSON.stringify(placeCategories) !== JSON.stringify(storedCategories)) {
      req.group.placeCategories = placeCategories;
      await req.group.save();
    }
    const searchRadiusMeters = getPlaceSearchRadius(placeCategories);
    const places = await findPlacesNearby(
      centroid.lat,
      centroid.lng,
      placeCategories,
      searchRadiusMeters
    );

    const ranked = places
      .map((place) => ({
        ...place,
        distance: haversineDistance(centroid.lat, centroid.lng, place.lat, place.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15); // giới hạn top 15 kết quả gần nhất

    const viewerLocation = locations.find(
      (location) => location.userId.toString() === req.userId
    );

    res.json({
      centroid,
      viewerLocation: viewerLocation
        ? { lat: viewerLocation.lat, lng: viewerLocation.lng }
        : null,
      placeCategories,
      searchRadiusMeters,
      availableCategories: PLACE_CATEGORIES.map(({ id, label }) => ({ id, label })),
      canEditPlaceCategories: String(req.group.createdBy) === String(req.userId),
      placeCategoriesLocked: Boolean(
        req.group.placeCategoriesLocked
        || req.group.finalizedPlace?.placeId
        || await Vote.exists({ groupId })
      ),
      suggestions: ranked,
    });
  } catch (err) {
    console.error('Lỗi tính gợi ý:', err);
    if (err.code === 'PLACES_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Dịch vụ tìm địa điểm đang tạm thời không khả dụng. Vui lòng thử lại sau.',
      });
    }
    res.status(500).json({ error: 'Lỗi server khi tính gợi ý' });
  }
}

async function getRouteToSuggestion(req, res) {
  try {
    const { groupId } = req.params;
    const { lat, lng } = req.body;
    if (!isValidCoordinate(lat, -90, 90) || !isValidCoordinate(lng, -180, 180)) {
      return res.status(400).json({ error: 'Tọa độ điểm đến không hợp lệ' });
    }

    const viewerLocation = await Location.findOne({ groupId, userId: req.userId });
    if (!viewerLocation) {
      return res.status(404).json({ error: 'Bạn chưa gửi vị trí trong nhóm này' });
    }

    const route = await getMotorcycleRoute(
      { lat: viewerLocation.lat, lng: viewerLocation.lng },
      { lat, lng }
    );
    if (!route) {
      return res.status(404).json({ error: 'Không tìm được đường đi tới địa điểm này' });
    }

    res.json(route);
  } catch (err) {
    console.error('Lỗi tìm đường tới địa điểm:', err.message);
    res.status(502).json({ error: 'Dịch vụ tìm đường tạm thời không khả dụng' });
  }
}

module.exports = {
  geocodePreview,
  reverseGeocodeAddress,
  submitLocation,
  getSuggestions,
  getRouteToSuggestion,
};
