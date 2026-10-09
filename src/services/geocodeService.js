const axios = require('axios');

const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode';
const REQUEST_TIMEOUT_MS = 15000;

function getApiKey() {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Thiếu GEOAPIFY_API_KEY trong biến môi trường');
    error.code = 'GEOCODING_UNAVAILABLE';
    throw error;
  }
  return apiKey;
}

// Địa chỉ dạng chữ -> tọa độ
async function geocode(addressText) {
  const response = await axios.get(`${GEOAPIFY_BASE}/search`, {
    params: {
      text: addressText,
      format: 'json',
      filter: 'countrycode:vn',
      limit: 1,
      apiKey: getApiKey(),
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const result = response.data?.results?.[0];
  if (!result) {
    return null;
  }

  return {
    lat: result.lat,
    lng: result.lon,
    matchedAddress: result.formatted,
  };
}

// Tọa độ -> địa chỉ dạng chữ (dùng cho hiển thị, không bắt buộc)
async function reverseGeocode(lat, lng) {
  const response = await axios.get(`${GEOAPIFY_BASE}/reverse`, {
    params: { lat, lon: lng, format: 'json', apiKey: getApiKey() },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return response.data?.results?.[0]?.formatted || null;
}

module.exports = { geocode, reverseGeocode };
