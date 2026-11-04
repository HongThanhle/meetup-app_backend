const PLACE_CATEGORIES = [
  { id: 'catering.cafe', label: 'Quán cà phê', type: 'Quán cà phê' },
  { id: 'catering.restaurant', label: 'Nhà hàng', type: 'Nhà hàng' },
  { id: 'catering.fast_food', label: 'Đồ ăn nhanh', type: 'Đồ ăn nhanh' },
  { id: 'commercial.food_and_drink.bakery', label: 'Tiệm bánh', type: 'Tiệm bánh' },
  { id: 'catering.ice_cream', label: 'Kem & tráng miệng', type: 'Kem & tráng miệng' },
  { id: 'entertainment.cinema', label: 'Rạp chiếu phim', type: 'Rạp chiếu phim' },
  { id: 'leisure.park', label: 'Công viên', type: 'Công viên' },
];

const DEFAULT_PLACE_CATEGORIES = ['catering.cafe', 'catering.restaurant'];
const GROUP_TYPE_PLACE_CATEGORIES = {
  coffee: ['catering.cafe'],
  food: ['catering.restaurant', 'catering.fast_food', 'commercial.food_and_drink.bakery', 'catering.ice_cream'],
  movie: ['entertainment.cinema'],
  other: DEFAULT_PLACE_CATEGORIES,
};
const PLACE_CATEGORY_IDS = new Set(PLACE_CATEGORIES.map(({ id }) => id));
const LEGACY_PLACE_CATEGORY_IDS = new Map([
  ['catering.bakery', 'commercial.food_and_drink.bakery'],
]);

function normalizePlaceCategories(categories) {
  return [...new Set(categories.map((category) => LEGACY_PLACE_CATEGORY_IDS.get(category) || category))];
}

function getPlaceSearchRadius(categories) {
  return categories.includes('entertainment.cinema') ? 5000 : 1500;
}

function getDefaultPlaceCategoriesForGroupType(groupType) {
  return [...(GROUP_TYPE_PLACE_CATEGORIES[groupType] || DEFAULT_PLACE_CATEGORIES)];
}

module.exports = {
  PLACE_CATEGORIES,
  DEFAULT_PLACE_CATEGORIES,
  getDefaultPlaceCategoriesForGroupType,
  PLACE_CATEGORY_IDS,
  normalizePlaceCategories,
  getPlaceSearchRadius,
};
