const axios = require('axios');

const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const REQUEST_TIMEOUT_MS = 12000;

function parseRoute(response, travelMode) {
  const route = response.data?.features?.[0];
  const geometry = route?.geometry;
  const coordinates = geometry?.type === 'MultiLineString'
    ? geometry.coordinates?.flat()
    : geometry?.coordinates;
  if (
    !['LineString', 'MultiLineString'].includes(geometry?.type)
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
    travelMode,
  };
}

async function requestRoute(start, destination, travelMode, apiKey) {
  const response = await axios.get(GEOAPIFY_ROUTING_URL, {
    params: {
      waypoints: `${start.lat},${start.lng}|${destination.lat},${destination.lng}`,
      mode: travelMode,
      type: 'balanced',
      units: 'metric',
      format: 'geojson',
      apiKey,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  return parseRoute(response, travelMode);
}

async function getMotorcycleRoute(start, destination) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Thiếu GEOAPIFY_API_KEY trong biến môi trường');
    error.code = 'ROUTING_UNAVAILABLE';
    throw error;
  }

  const modes = [
    { requestMode: 'motorcycle', responseMode: 'motorcycle' },
    { requestMode: 'scooter', responseMode: 'scooter' },
    { requestMode: 'drive', responseMode: 'drive-fallback' },
  ];
  const requestErrors = [];
  for (const { requestMode, responseMode } of modes) {
    try {
      const route = await requestRoute(start, destination, requestMode, apiKey);
      if (route) {
        route.travelMode = responseMode;
        return route;
      }

      console.warn('Geoapify không tìm thấy tuyến cho profile:', {
        travelMode: requestMode,
      });
    } catch (cause) {
      requestErrors.push(cause);
      console.error('Geoapify Routing lỗi:', {
        travelMode: requestMode,
        status: cause.response?.status,
        message: cause.message,
        details: cause.response?.data?.message || cause.response?.data?.error,
      });
    }
  }

  if (requestErrors.length === modes.length) {
    const error = new Error('Không thể lấy tuyến xe máy từ Geoapify');
    error.code = 'ROUTING_UNAVAILABLE';
    throw error;
  }

  return null;
}

module.exports = { getMotorcycleRoute };
