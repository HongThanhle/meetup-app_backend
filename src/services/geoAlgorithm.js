// Trung bình cộng tọa độ — điểm trung tâm đơn giản
function calculateCentroid(points) {
  const n = points.length;
  const sumLat = points.reduce((s, p) => s + p.lat, 0);
  const sumLng = points.reduce((s, p) => s + p.lng, 0);
  return { lat: sumLat / n, lng: sumLng / n };
}

function calculateGeometricMedian(points) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('Cần ít nhất một tọa độ để tính tâm hình học');
  }
  if (!points.every((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))) {
    throw new Error('Tọa độ dùng để tính tâm hình học không hợp lệ');
  }

  const arithmeticCenter = calculateCentroid(points);
  // Dùng mặt phẳng cục bộ vì các điểm trong một nhóm ở gần nhau.
  const longitudeScale = Math.max(
    Math.cos((arithmeticCenter.lat * Math.PI) / 180),
    1e-12
  );
  const projectedPoints = points.map((point) => ({
    x: (point.lng - arithmeticCenter.lng) * longitudeScale,
    y: point.lat - arithmeticCenter.lat,
  }));
  let estimate = { x: 0, y: 0 };

  for (let iteration = 0; iteration < 200; iteration += 1) {
    let coincidentCount = 0;
    let weightedX = 0;
    let weightedY = 0;
    let residualX = 0;
    let residualY = 0;
    let totalWeight = 0;

    projectedPoints.forEach((point) => {
      const dx = point.x - estimate.x;
      const dy = point.y - estimate.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1e-12) {
        coincidentCount += 1;
        return;
      }

      const weight = 1 / distance;
      totalWeight += weight;
      weightedX += point.x * weight;
      weightedY += point.y * weight;
      residualX += dx * weight;
      residualY += dy * weight;
    });

    if (totalWeight === 0) {
      break;
    }

    let next = { x: weightedX / totalWeight, y: weightedY / totalWeight };
    if (coincidentCount > 0) {
      const residualMagnitude = Math.hypot(residualX, residualY);
      if (residualMagnitude <= coincidentCount) {
        break;
      }
      const retainedWeight = coincidentCount / residualMagnitude;
      next = {
        x: (1 - retainedWeight) * next.x + retainedWeight * estimate.x,
        y: (1 - retainedWeight) * next.y + retainedWeight * estimate.y,
      };
    }

    if (Math.hypot(next.x - estimate.x, next.y - estimate.y) < 1e-10) {
      estimate = next;
      break;
    }
    estimate = next;
  }

  return {
    lat: arithmeticCenter.lat + estimate.y,
    lng: arithmeticCenter.lng + estimate.x / longitudeScale,
  };
}

// Khoảng cách giữa 2 điểm trên mặt cầu Trái Đất, đơn vị km
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { calculateCentroid, calculateGeometricMedian, haversineDistance };
