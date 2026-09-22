const axios = require('axios');

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
// Nominatim yêu cầu 1 User-Agent định danh app, không dùng header mặc định của axios
const HEADERS = { 'User-Agent': 'MeetupApp/1.0 (student project)' };

// Địa chỉ dạng chữ -> tọa độ
async function geocode(addressText) {
  const response = await axios.get(`${NOMINATIM_BASE}/search`, {
    params: {
      q: addressText,
      format: 'json',
      limit: 1,
      countrycodes: 'vn',
    },
    headers: HEADERS,
  });

  if (!response.data || response.data.length === 0) {
    return null;
  }

  return {
    lat: parseFloat(response.data[0].lat),
    lng: parseFloat(response.data[0].lon),
    matchedAddress: response.data[0].display_name,
  };
}

// Tọa độ -> địa chỉ dạng chữ (dùng cho hiển thị, không bắt buộc)
async function reverseGeocode(lat, lng) {
  const response = await axios.get(`${NOMINATIM_BASE}/reverse`, {
    params: { lat, lon: lng, format: 'json' },
    headers: HEADERS,
  });
  return response.data?.display_name || null;
}

module.exports = { geocode, reverseGeocode };
