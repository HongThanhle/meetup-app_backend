const axios = require('axios');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function findCafesNearby(lat, lng, radiusMeters = 1500) {
  const query = `
    [out:json];
    (
      node["amenity"="cafe"](around:${radiusMeters}, ${lat}, ${lng});
      node["amenity"="restaurant"](around:${radiusMeters}, ${lat}, ${lng});
    );
    out body;
  `;

  const response = await axios.post(OVERPASS_URL, query, {
    headers: { 'Content-Type': 'text/plain' },
    timeout: 20000,
  });

  return response.data.elements.map((place) => ({
    id: place.id,
    name: place.tags.name || 'Không rõ tên',
    lat: place.lat,
    lng: place.lon,
  }));
}

module.exports = { findCafesNearby };
