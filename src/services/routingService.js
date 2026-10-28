const axios = require('axios');

const GEOAPIFY_ROUTING_URL = 'https://api.geoapify.com/v1/routing';
const GEOAPIFY_MATRIX_URL = 'https://api.geoapify.com/v1/routematrix';
const OSRM_ROUTING_URL = 'https://router.project-osrm.org/route/v1/driving';
const OSRM_TABLE_URL = 'https://router.project-osrm.org/table/v1/driving';
const REQUEST_TIMEOUT_MS = 12000;
const ROUTE_REQUEST_TIMEOUT_MS = 8000;

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
    timeout: ROUTE_REQUEST_TIMEOUT_MS,
  });

  return parseRoute(response, travelMode);
}

async function requestDrivingRoute(start, destination) {
  const coordinates = `${start.lng},${start.lat};${destination.lng},${destination.lat}`;
  const response = await axios.get(`${OSRM_ROUTING_URL}/${coordinates}`, {
    params: {
      overview: 'full',
      geometries: 'geojson',
      steps: false,
    },
    timeout: ROUTE_REQUEST_TIMEOUT_MS,
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
    travelMode: 'drive',
  };
}

async function getTravelTimeMatrix(sources, targets, travelMode) {
  try {
    if (travelMode === 'drive') {
      const allPoints = [...sources, ...targets];
      const coordinates = allPoints.map(({ lat, lng }) => `${lng},${lat}`).join(';');
      const response = await axios.get(`${OSRM_TABLE_URL}/${coordinates}`, {
        params: {
          sources: sources.map((_, index) => index).join(';'),
          destinations: targets.map((_, index) => sources.length + index).join(';'),
          annotations: 'duration,distance',
        },
        timeout: REQUEST_TIMEOUT_MS,
      });
      const { durations, distances } = response.data || {};
      if (
        response.data?.code !== 'Ok'
        || !Array.isArray(durations)
        || durations.length !== sources.length
        || !Array.isArray(distances)
        || distances.length !== sources.length
        || durations.some((row) => !Array.isArray(row) || row.length !== targets.length)
        || distances.some((row) => !Array.isArray(row) || row.length !== targets.length)
      ) {
        throw new Error('OSRM Table trả về ma trận không hợp lệ');
      }

      return durations.map((row, sourceIndex) => row.map((durationSeconds, targetIndex) => (
        Number.isFinite(durationSeconds) && Number.isFinite(distances[sourceIndex][targetIndex])
          ? {
            durationSeconds,
            distanceMeters: distances[sourceIndex][targetIndex],
          }
          : null
      )));
    }

    const apiKey = process.env.GEOAPIFY_API_KEY;
    if (!apiKey) {
      const error = new Error('Thiếu GEOAPIFY_API_KEY để tính thời gian di chuyển');
      error.code = 'ROUTING_UNAVAILABLE';
      throw error;
    }

    const response = await axios.post(
      GEOAPIFY_MATRIX_URL,
      {
        mode: travelMode === 'motorcycle' ? 'scooter' : travelMode,
        sources: sources.map(({ lat, lng }) => ({ location: [lng, lat] })),
        targets: targets.map(({ lat, lng }) => ({ location: [lng, lat] })),
      },
      {
        params: { apiKey },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );
    const matrix = response.data?.sources_to_targets || response.data?.matrix;
    if (
      !Array.isArray(matrix)
      || matrix.length !== sources.length
      || matrix.some((row) => !Array.isArray(row) || row.length !== targets.length)
    ) {
      throw new Error('Geoapify Matrix trả về ma trận không hợp lệ');
    }

    return matrix.map((row) => row.map((cell) => (
      Number.isFinite(cell?.time) && Number.isFinite(cell?.distance)
        ? { durationSeconds: cell.time, distanceMeters: cell.distance }
        : null
    )));
  } catch (cause) {
    console.error('Routing Matrix lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.error,
      travelMode,
    });
    const error = new Error('Không thể tính ma trận thời gian di chuyển');
    error.code = 'ROUTING_UNAVAILABLE';
    throw error;
  }
}

async function getRouteForMode(start, destination, travelMode) {
  if (travelMode === 'drive') {
    try {
      return await requestDrivingRoute(start, destination);
    } catch (cause) {
      console.error('OSRM Routing lỗi:', {
        status: cause.response?.status,
        message: cause.message,
        details: cause.response?.data?.message || cause.response?.data?.code,
      });
      return null;
    }
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (apiKey) {
    const requestModes = travelMode === 'motorcycle' ? ['scooter'] : [travelMode];
    for (const requestMode of requestModes) {
      try {
        const route = await requestRoute(start, destination, requestMode, apiKey);
        if (route) {
          return route;
        }
      } catch (cause) {
        console.error('Geoapify Routing lỗi:', {
          travelMode: requestMode,
          status: cause.response?.status,
          message: cause.message,
          details: cause.response?.data?.message || cause.response?.data?.error,
        });
      }
    }
  } else {
    console.warn('Thiếu GEOAPIFY_API_KEY; không thể dùng profile tuyến đường Geoapify.');
  }

  if (travelMode === 'motorcycle') {
    try {
      const fallbackRoute = await requestDrivingRoute(start, destination);
      if (fallbackRoute) {
        return { ...fallbackRoute, travelMode: 'drive-fallback' };
      }
    } catch (cause) {
      console.error('OSRM Routing dự phòng lỗi:', {
        status: cause.response?.status,
        message: cause.message,
        details: cause.response?.data?.message || cause.response?.data?.code,
      });
    }
  }

  return null;
}

async function getMotorcycleRoute(start, destination) {
  return getRouteForMode(start, destination, 'motorcycle');
}

module.exports = { getMotorcycleRoute, getRouteForMode, getTravelTimeMatrix };
