-- Migration: attach containers to sensor devices + store weights in kilograms
-- Date: 2026-02-11

-- 1) Add device_id to waste containers so we can link to weight_sensor_tbl
ALTER TABLE waste_containers_tbl
  ADD COLUMN device_id VARCHAR(50) NULL AFTER status;

CREATE INDEX idx_waste_containers_device_id ON waste_containers_tbl (device_id);

-- (Optional but recommended) ensure one device maps to one container
-- If you want this constraint, uncomment:
-- ALTER TABLE waste_containers_tbl
--   ADD UNIQUE KEY uq_waste_containers_device_id (device_id);

-- 2) Ensure sensor weights are stored in kilograms (DECIMAL for precision)
ALTER TABLE weight_sensor_tbl
  MODIFY COLUMN weight DECIMAL(10,3) NOT NULL;

-- Convert legacy grams to kilograms (heuristic: legacy values are typically > 1000)
UPDATE weight_sensor_tbl
SET weight = weight / 1000
WHERE weight > 1000;

-- 3) Speed up latest-reading joins
CREATE INDEX idx_weight_sensor_tbl_device_time ON weight_sensor_tbl (device_id, created_at);
