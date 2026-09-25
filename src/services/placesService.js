const axios = require('axios');

const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass-api.de/api/interpreter', // để cuối cùng
];

const REQUEST_TIMEOUT_MS = 10000;

function getOverpassEndpoints() {
  const configuredEndpoint = process.env.OVERPASS_URL?.trim();
  return configuredEndpoint
    ? [configuredEndpoint, ...DEFAULT_OVERPASS_ENDPOINTS.filter((url) => url !== configuredEndpoint)]
    : DEFAULT_OVERPASS_ENDPOINTS;
}

async function findCafesNearby(lat, lng, radiusMeters = 1500) {
  const query = `
    [out:json][timeout:10];
    (
      node["amenity"="cafe"](around:${radiusMeters},${lat},${lng});
      node["amenity"="restaurant"](around:${radiusMeters},${lat},${lng});
    );
    out body;
  `;

  let lastError;

  for (const url of getOverpassEndpoints()) {
    try {
      const response = await axios.post(url, query, {
        headers: { 'Content-Type': 'text/plain' },
        timeout: REQUEST_TIMEOUT_MS,
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
  const error = new Error(
    `Không thể kết nối Overpass API. Lỗi cuối: ${lastError?.message || 'Unknown'}`
  );
  error.code = 'PLACES_UNAVAILABLE';
  throw error;
}

module.exports = { findCafesNearby };