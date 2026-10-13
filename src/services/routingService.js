const axios = require('axios');

const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const OSRM_ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
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

async function requestDrivingFallback(start, destination) {
  const coordinates = `${start.lng},${start.lat};${destination.lng},${destination.lat}`;
  const response = await axios.get(`${OSRM_ROUTING_URL}/${coordinates}`, {
    params: {
      overview: 'full',
      geometries: 'geojson',
      steps: false,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
  const route = response.data?.routes?.[0];
  if (
    response.data?.code !== 'Ok'
    || !Array.isArray(route?.geometry?.coordinates)
    || route.geometry.coordinates.length < 2
    || !route.geometry.coordinates.every((point) => (
      Array.isArray(point)
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
    ))
    || !Number.isFinite(route.distance)
    || !Number.isFinite(route.duration)
  ) {
    return null;
  }

  return {
    coordinates: route.geometry.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    travelMode: 'drive-fallback',
  };
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
  ];
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
      console.error('Geoapify Routing lỗi:', {
        travelMode: requestMode,
        status: cause.response?.status,
        message: cause.message,
        details: cause.response?.data?.message || cause.response?.data?.error,
      });
    }
  }

  try {
    const fallbackRoute = await requestDrivingFallback(start, destination);
    if (fallbackRoute) {
      console.warn('Đang dùng tuyến ô tô OSRM thay cho tuyến xe máy.');
      return fallbackRoute;
    }
    console.warn('OSRM không tìm thấy tuyến lái xe cho hai tọa độ đã chọn.');
  } catch (cause) {
    console.error('OSRM Routing lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.code,
    });
  }

  return null;
}

module.exports = { getMotorcycleRoute };
