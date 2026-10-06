const axios = require('axios');

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';
const REQUEST_TIMEOUT_MS = 12000;

async function getDrivingRoute(start, destination) {
  const coordinates = [
    `${start.lng},${start.lat}`,
    `${destination.lng},${destination.lat}`,
  ].join(';');
  const response = await axios.get(`${OSRM_ROUTE_URL}/${coordinates}`, {
    params: {
      overview: 'full',
      geometries: 'geojson',
      steps: false,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  const route = response.data?.routes?.[0];
  if (response.data?.code !== 'Ok' || !Array.isArray(route?.geometry?.coordinates)) {
    return null;
  }

  return {
    coordinates: route.geometry.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

module.exports = { getDrivingRoute };
