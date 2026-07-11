-- 診所 GPS 與打卡半徑（200 公尺）
UPDATE clinics
SET
  latitude = 24.67873,
  longitude = 121.76421,
  geo_radius_m = 200
WHERE id = (
  SELECT id FROM clinics ORDER BY created_at ASC LIMIT 1
);

-- 若尚無診所資料，可改為 INSERT（通常已有 001 schema 建立的列）
-- UPDATE 0 筆時，請到 Supabase Table Editor 手動填 latitude / longitude / geo_radius_m
