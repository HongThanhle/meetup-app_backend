const axios = require('axios');

const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
  'https://overpass-api.de/api/interpreter', // để cuối cùng
];

const REQUEST_TIMEOUT_MS = 10000;
const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_HEADERS = {
  'User-Agent': 'MeetupApp/1.0 (student project)',
};

function getOverpassEndpoints() {
  const configuredEndpoint = process.env.OVERPASS_URL?.trim();
  return configuredEndpoint
    ? [configuredEndpoint, ...DEFAULT_OVERPASS_ENDPOINTS.filter((url) => url !== configuredEndpoint)]
    : DEFAULT_OVERPASS_ENDPOINTS;
}

function getBoundingBox(lat, lng, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  return [lng + lngDelta, lat + latDelta, lng - lngDelta, lat - latDelta].join(',');
}

async function findCafesWithNominatim(lat, lng, radiusMeters) {
  const response = await axios.get(NOMINATIM_URL, {
    params: {
      q: 'cafe',
      format: 'jsonv2',
      limit: 50,
      bounded: 1,
      viewbox: getBoundingBox(lat, lng, radiusMeters),
    },
    headers: NOMINATIM_HEADERS,
    timeout: REQUEST_TIMEOUT_MS,
  });

  return (response.data || [])
    .map((place) => ({
      id: `nominatim-${place.osm_type}-${place.osm_id}`,
      name: place.display_name?.split(',')[0] || 'Không rõ tên',
      lat: Number(place.lat),
      lng: Number(place.lon),
    }))
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
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

  try {
    console.warn('Overpass unavailable, trying Nominatim fallback');
    return await findCafesWithNominatim(lat, lng, radiusMeters);
  } catch (err) {
    lastError = err;
    console.warn('Nominatim fallback failed:', err.message);
  }

  // Tất cả endpoint đều fail
  const error = new Error(
    `Không thể lấy địa điểm từ Overpass hoặc Nominatim. Lỗi cuối: ${lastError?.message || 'Unknown'}`
  );
  error.code = 'PLACES_UNAVAILABLE';
  throw error;
}

module.exports = { findCafesNearby };