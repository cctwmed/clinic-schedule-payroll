/** Haversine 公式：計算兩 GPS 點距離（公尺） */
export function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(
  userLat: number,
  userLng: number,
  clinicLat: number,
  clinicLng: number,
  radiusM: number
): boolean {
  return getDistanceMeters(userLat, userLng, clinicLat, clinicLng) <= radiusM;
}
