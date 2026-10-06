const axios = require('axios');

const GEOAPIFY_BASE = 'https://api.geoapify.com/v2/places';
const REQUEST_TIMEOUT_MS = 15000;

async function findCafesNearby(lat, lng, radiusMeters = 1500) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Thiếu GEOAPIFY_API_KEY trong biến môi trường');
    error.code = 'PLACES_UNAVAILABLE';
    throw error;
  }

  try {
    const response = await axios.get(GEOAPIFY_BASE, {
      params: {
        categories: 'catering.cafe,catering.restaurant',
        filter: `circle:${lng},${lat},${radiusMeters}`,
        limit: 20,
        apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const features = response.data.features || [];

    return features.map((f) => {
      const props = f.properties;
      const isCafe = (props.categories || []).some((c) => c.includes('cafe'));

      return {
        id: String(props.place_id),
        name: props.name || 'Không rõ tên',
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        address: props.formatted || null,
        type: isCafe ? 'Quán cà phê' : 'Nhà hàng',
        website: props.website || null,
        phone: props.contact?.phone || null,
      };
    });
  } catch (err) {
    console.error('Geoapify lỗi:', err.message);
    const error = new Error(`Không thể lấy địa điểm từ Geoapify: ${err.message}`);
    error.code = 'PLACES_UNAVAILABLE';
    throw error;
  }
}

module.exports = { findCafesNearby };