-- 打卡有效半徑改為 300 公尺
ALTER TABLE clinics ALTER COLUMN geo_radius_m SET DEFAULT 300;

UPDATE clinics
SET geo_radius_m = 300
WHERE geo_radius_m IS DISTINCT FROM 300;
