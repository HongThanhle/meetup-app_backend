const axios = require('axios');

const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const REQUEST_TIMEOUT_MS = 12000;

async function getMotorcycleRoute(start, destination) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Thiếu GEOAPIFY_API_KEY trong biến môi trường');
    error.code = 'ROUTING_UNAVAILABLE';
    throw error;
  }

  let response;
  try {
    response = await axios.get(GEOAPIFY_ROUTING_URL, {
      params: {
        waypoints: `${start.lat},${start.lng}|${destination.lat},${destination.lng}`,
        mode: 'scooter',
        type: 'balanced',
        units: 'metric',
        format: 'geojson',
        apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });
  } catch (cause) {
    console.error('Geoapify Routing lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.error,
    });
    const error = new Error('Không thể lấy tuyến xe máy từ Geoapify');
    error.code = 'ROUTING_UNAVAILABLE';
    throw error;
  }

  const route = response.data?.features?.[0];
  const coordinates = route?.geometry?.coordinates;
  if (
    route?.geometry?.type !== 'LineString'
    || !Array.isArray(coordinates)
    || coordinates.length < 2
    || !coordinates.every((point) => (
      Array.isArray(point)
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
    ))
    || !Number.isFinite(route.properties?.distance)
    || !Number.isFinite(route.properties?.time)
  ) {
    return null;
  }

  return {
    coordinates,
    distanceMeters: route.properties.distance,
    durationSeconds: route.properties.time,
    travelMode: 'scooter',
  };
}

module.exports = { getMotorcycleRoute };
