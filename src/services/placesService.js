const axios = require('axios');

// Danh sách endpoint dự phòng (ưu tiên cái ổn định hơn)
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass-api.de/api/interpreter', // để cuối cùng
];

async function findCafesNearby(lat, lng, radiusMeters = 1500) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
      node["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
    );
    out body;
  `;

  let lastError;

  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const response = await axios.post(url, query, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: 25000,
      });

      // Thành công → map dữ liệu
      return (response.data.elements || []).map((place) => ({
        id: place.id,
        name: place.tags?.name || 'Không rõ tên',
        lat: place.lat,
        lng: place.lon,
      }));
    } catch (err) {
      lastError = err;
      console.warn(`Overpass failed on ${url}:`, err.message);
      // thử endpoint tiếp theo
    }
  }

  // Tất cả endpoint đều fail
  throw new Error(
    `Không thể kết nối Overpass API. Lỗi cuối: ${lastError?.message || 'Unknown'}`
  );
}

module.exports = { findCafesNearby };