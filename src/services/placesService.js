const axios = require('axios');
const { PLACE_CATEGORIES } = require('./placeCategories');
const { formatAddress } = require('./geocodeService');

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
        lang: 'vi',
        apiKey,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    const selectedCategories = new Set(categories);
    const categoryTypes = new Map(PLACE_CATEGORIES.map(({ id, type }) => [id, type]));

    return (response.data?.features || []).flatMap((feature) => {
      const properties = feature.properties || {};
      const matchingCategory = (properties.categories || []).find((category) => (
        [...selectedCategories].some((selected) => (
          category === selected || category.startsWith(`${selected}.`)
        ))
      ));
      const name = typeof properties.name === 'string' ? properties.name.trim() : '';
      const address = formatAddress(properties);
      const coordinates = feature.geometry?.coordinates;

      if (
        !matchingCategory
        || !properties.place_id
        || !name
        || !address
        || !Array.isArray(coordinates)
        || !Number.isFinite(coordinates[0])
        || !Number.isFinite(coordinates[1])
      ) {
        return [];
      }

      return [{
        id: String(properties.place_id),
        name,
        lat: coordinates[1],
        lng: coordinates[0],
        address,
        type: categoryTypes.get(matchingCategory)
          || PLACE_CATEGORIES.find(({ id }) => matchingCategory.startsWith(`${id}.`))?.type
          || 'Địa điểm',
        website: properties.website || null,
        phone: properties.contact?.phone || null,
      }];
    });
  } catch (cause) {
    console.error('Geoapify Places lỗi:', {
      status: cause.response?.status,
      message: cause.message,
      details: cause.response?.data?.message || cause.response?.data?.error,
    });
    const error = new Error('Không thể lấy địa điểm từ Geoapify');
    error.code = 'PLACES_UNAVAILABLE';
    throw error;
  }
}

module.exports = { findPlacesNearby };
