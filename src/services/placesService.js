const axios = require('axios');
const { PLACE_CATEGORIES } = require('./placeCategories');

const GEOAPIFY_BASE = 'https://api.geoapify.com/v2/places';
const REQUEST_TIMEOUT_MS = 15000;

async function findPlacesNearby(lat, lng, categories, radiusMeters = 1500) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('Cần chọn ít nhất một loại địa điểm');
  }

  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error('Thiếu GEOAPIFY_API_KEY trong biến môi trường');
    error.code = 'PLACES_UNAVAILABLE';
    throw error;
  }

  try {
    const response = await axios.get(GEOAPIFY_BASE, {
      params: {
        categories: categories.join(','),
        filter: `circle:${lng},${lat},${radiusMeters}`,
        limit: 50,
        apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const features = response.data.features || [];

    const selectedCategories = new Set(categories);
    const categoryTypes = new Map(PLACE_CATEGORIES.map(({ id, type }) => [id, type]));

    return features.flatMap((f) => {
      const props = f.properties;
      const matchingCategory = (props.categories || []).find((category) => (
        [...selectedCategories].some((selected) => (
          category === selected || category.startsWith(`${selected}.`)
        ))
      ));
      const name = typeof props.name === 'string' ? props.name.trim() : '';
      const address = typeof props.formatted === 'string' ? props.formatted.trim() : '';
      const coordinates = f.geometry?.coordinates;

      if (
        !matchingCategory
        || !props.place_id
        || !name
        || !address
        || !Array.isArray(coordinates)
        || !Number.isFinite(coordinates[0])
        || !Number.isFinite(coordinates[1])
      ) {
        return [];
      }

      return [{
        id: String(props.place_id),
        name,
        lat: coordinates[1],
        lng: coordinates[0],
        address,
        type: categoryTypes.get(matchingCategory)
          || PLACE_CATEGORIES.find(({ id }) => matchingCategory.startsWith(`${id}.`))?.type
          || 'Địa điểm',
        website: props.website || null,
        phone: props.contact?.phone || null,
      }];
    });
  } catch (err) {
    console.error('Geoapify lỗi:', err.message);
    const error = new Error(`Không thể lấy địa điểm từ Geoapify: ${err.message}`);
    error.code = 'PLACES_UNAVAILABLE';
    throw error;
  }
}

module.exports = { findPlacesNearby };