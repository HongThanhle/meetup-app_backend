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

function formatAddress(result) {
  const localArea = [result.suburb, result.district]
    .filter((part) => typeof part === 'string' && part.trim());
  const addressParts = [
    result.housenumber,
    result.street,
    ...localArea,
    ...(localArea.length > 0 || result.state ? [] : [result.city]),
    result.state,
    result.country,
  ].filter((part) => typeof part === 'string' && part.trim());
  const structuredAddress = [...new Set(addressParts.map((part) => part.trim()))].join(', ');

  return structuredAddress || result.formatted || '';
}

async function geocode(addressText) {
  try {
    const response = await axios.get(`${GEOAPIFY_BASE}/search`, {
      params: {
        text: addressText,
        format: 'json',
        filter: 'countrycode:vn',
        limit: 5,
        lang: 'vi',
        apiKey: getApiKey(),
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    return (response.data?.results || []).flatMap((result) => {
      const matchedAddress = formatAddress(result);
      if (
        !matchedAddress
        || !Number.isFinite(result.lat)
        || !Number.isFinite(result.lon)
      ) {
        return [];
      }

      return [{
        lat: result.lat,
        lng: result.lon,
        matchedAddress,
      }];
    });
  } catch (cause) {
    console.error('Geoapify Geocoding lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.error,
    });
    const error = new Error('Không thể lấy địa chỉ từ Geoapify');
    error.code = 'GEOCODING_UNAVAILABLE';
    throw error;
  }
}

async function reverseGeocode(lat, lng) {
  try {
    const response = await axios.get(`${GEOAPIFY_BASE}/reverse`, {
      params: { lat, lon: lng, format: 'json', lang: 'vi', apiKey: getApiKey() },
      timeout: REQUEST_TIMEOUT_MS,
    });
    const result = response.data?.results?.[0];
    return result ? formatAddress(result) || null : null;
  } catch (cause) {
    console.error('Geoapify Reverse Geocoding lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.error,
    });
    const error = new Error('Không thể lấy địa chỉ từ Geoapify');
    error.code = 'GEOCODING_UNAVAILABLE';
    throw error;
  }
}

module.exports = { geocode, reverseGeocode, formatAddress };
