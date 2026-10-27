const Location = require('../models/Location');
const Vote = require('../models/Vote');
const { geocode, reverseGeocode } = require('../services/geocodeService');
const { findPlacesNearby } = require('../services/placesService');
const {
  DEFAULT_PLACE_CATEGORIES,
  PLACE_CATEGORIES,
  normalizePlaceCategories,
  getPlaceSearchRadius,
} = require('../services/placeCategories');
const {
  getRouteForMode,
  getTravelTimeMatrix,
} = require('../services/routingService');
const {
  calculateCentroid,
  calculateGeometricMedian,
  haversineDistance,
} = require('../services/geoAlgorithm');
const { isNonEmptyString, isValidCoordinate } = require('../middleware/validation');

const TRAVEL_MODES = new Set(['motorcycle', 'drive', 'walk']);

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
    const {
      source,
      lat,
      lng,
      address,
      travelMode = 'motorcycle',
    } = req.body;

    if (
      !['gps', 'manual'].includes(source)
      || !TRAVEL_MODES.has(travelMode)
      || !isValidCoordinate(lat, -90, 90)
      || !isValidCoordinate(lng, -180, 180)
    ) {
      return res.status(400).json({ error: 'Thông tin vị trí không hợp lệ' });
    }

    if (source === 'manual' && !isNonEmptyString(address, 500)) {
      return res.status(400).json({ error: 'Địa chỉ không hợp lệ' });
    }

    // upsert: nếu user đã gửi vị trí trước đó trong nhóm này, ghi đè thay vì tạo mới
    const location = await Location.findOneAndUpdate(
      { groupId, userId: req.userId },
      {
        lat,
        lng,
        source,
        travelMode,
        rawAddress: source === 'manual' ? address.trim() : null,
      },
      { new: true, upsert: true }
    );

    res.json(location);
  } catch (err) {
    console.error('Lỗi lưu vị trí:', err);
    res.status(500).json({ error: 'Lỗi server khi lưu vị trí' });
  }
}

// Tính tâm hình học từ mọi vị trí trong nhóm, rồi xếp hạng theo chênh lệch ETA.
async function getSuggestions(req, res) {
  try {
    const { groupId } = req.params;
    const members = req.group.members.filter((member) => member.userId);
    if (members.length === 0) {
      return res.status(409).json({ error: 'Nhóm chưa có thành viên để tính gợi ý.' });
    }
    const memberIds = members.map((member) => member.userId);
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

    const locationsByUserId = new Map(
      locations.map((location) => [String(location.userId), location])
    );
    const travelers = members.map((member) => {
      const userId = String(member.userId);
      const location = locationsByUserId.get(userId);
      return {
        userId,
        name: member.name || 'Thành viên',
        travelMode: TRAVEL_MODES.has(location.travelMode)
          ? location.travelMode
          : 'motorcycle',
        location: { lat: location.lat, lng: location.lng },
      };
    });
    const arithmeticCentroid = calculateCentroid(locations);
    const centroid = calculateGeometricMedian(locations);

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

    const candidates = places
      .map((place) => ({
        ...place,
        distance: haversineDistance(centroid.lat, centroid.lng, place.lat, place.lng),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 15);

    const travelersByMode = new Map();
    travelers.forEach((traveler) => {
      if (!travelersByMode.has(traveler.travelMode)) {
        travelersByMode.set(traveler.travelMode, []);
      }
      travelersByMode.get(traveler.travelMode).push(traveler);
    });

    const matricesByMode = new Map(await Promise.all(
      [...travelersByMode.entries()].map(async ([travelMode, modeTravelers]) => {
        const matrix = candidates.length > 0
          ? await getTravelTimeMatrix(
            modeTravelers.map((traveler) => traveler.location),
            candidates.map((place) => ({ lat: place.lat, lng: place.lng })),
            travelMode
          )
          : [];
        return [travelMode, { travelers: modeTravelers, matrix }];
      })
    ));

    const ranked = candidates
      .map((place, placeIndex) => {
        const travelTimes = travelers.map((traveler) => {
          const modeData = matricesByMode.get(traveler.travelMode);
          const travelerIndex = modeData.travelers.indexOf(traveler);
          const route = modeData.matrix[travelerIndex]?.[placeIndex];
          return {
            userId: traveler.userId,
            name: traveler.name,
            travelMode: traveler.travelMode,
            durationSeconds: route?.durationSeconds ?? null,
            distanceMeters: route?.distanceMeters ?? null,
          };
        });
        const availableTimes = travelTimes
          .map(({ durationSeconds }) => durationSeconds)
          .filter(Number.isFinite);
        const hasCompleteRoutes = availableTimes.length === travelers.length;
        const travelTimeSpreadSeconds = hasCompleteRoutes
          ? Math.max(...availableTimes) - Math.min(...availableTimes)
          : null;
        const averageTravelTimeSeconds = availableTimes.length > 0
          ? availableTimes.reduce((sum, seconds) => sum + seconds, 0) / availableTimes.length
          : null;

        return {
          ...place,
          travelTimes,
          travelTimeSpreadSeconds,
          averageTravelTimeSeconds,
        };
      })
      .sort((a, b) => {
        if (a.travelTimeSpreadSeconds === null && b.travelTimeSpreadSeconds !== null) return 1;
        if (a.travelTimeSpreadSeconds !== null && b.travelTimeSpreadSeconds === null) return -1;
        if (a.travelTimeSpreadSeconds !== b.travelTimeSpreadSeconds) {
          return a.travelTimeSpreadSeconds - b.travelTimeSpreadSeconds;
        }
        if (a.averageTravelTimeSeconds !== b.averageTravelTimeSeconds) {
          return (a.averageTravelTimeSeconds ?? Infinity) - (b.averageTravelTimeSeconds ?? Infinity);
        }
        return a.distance - b.distance;
      });

    const viewerLocation = locations.find(
      (location) => location.userId.toString() === req.userId
    );

    res.json({
      centroid,
      geometricMedian: centroid,
      arithmeticCentroid,
      viewerLocation: viewerLocation
        ? {
          lat: viewerLocation.lat,
          lng: viewerLocation.lng,
          travelMode: TRAVEL_MODES.has(viewerLocation.travelMode)
            ? viewerLocation.travelMode
            : 'motorcycle',
        }
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
    if (err.code === 'ROUTING_UNAVAILABLE') {
      return res.status(503).json({
        error: 'Dịch vụ tính thời gian di chuyển đang tạm thời không khả dụng. Vui lòng thử lại sau.',
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

    const route = await getRouteForMode(
      { lat: viewerLocation.lat, lng: viewerLocation.lng },
      { lat, lng },
      TRAVEL_MODES.has(viewerLocation.travelMode)
        ? viewerLocation.travelMode
        : 'motorcycle'
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
