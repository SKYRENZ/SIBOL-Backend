-- Migration: cache latest sensor weight on waste_containers_tbl
-- Date: 2026-02-11
--
-- Purpose:
-- - Store each container's latest weight (kg) directly on waste_containers_tbl
-- - Automatically update it whenever a new row is inserted into weight_sensor_tbl
-- - Enables area collection gating without scanning/joining the sensor table

-- 1) Add cache columns to waste_containers_tbl
ALTER TABLE waste_containers_tbl
  ADD COLUMN latest_weight_kg DECIMAL(10,3) NULL AFTER device_id,
  ADD COLUMN last_weight_at TIMESTAMP NULL AFTER latest_weight_kg;

-- Optional index for area-based queries
CREATE INDEX idx_waste_containers_area_latest_weight
  ON waste_containers_tbl (area_id, latest_weight_kg);

-- 2) Trigger to keep cache columns in sync and emit CONTAINER_FULL alerts
DROP TRIGGER IF EXISTS trg_weight_sensor_after_insert;

DELIMITER $$
CREATE TRIGGER trg_weight_sensor_after_insert
AFTER INSERT ON weight_sensor_tbl
FOR EACH ROW
BEGIN
  DECLARE v_container_id INT;
  DECLARE v_container_name VARCHAR(100);
  DECLARE v_area_name VARCHAR(255);
  DECLARE v_prev_status VARCHAR(32);
  DECLARE v_found INT DEFAULT 1;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_found = 0;

  -- find the container attached to this device_id
  SELECT wc.container_id, wc.container_name, a.Area_Name, wc.status
    INTO v_container_id, v_container_name, v_area_name, v_prev_status
  FROM waste_containers_tbl wc
  LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
  WHERE wc.device_id = NEW.device_id
  LIMIT 1;

  IF v_found = 1 THEN
    -- Always cache the latest weight and timestamp
    UPDATE waste_containers_tbl
    SET latest_weight_kg = NEW.weight,
        last_weight_at = NEW.created_at
    WHERE container_id = v_container_id;

    -- Fullness transitions + alert
    IF NEW.weight >= 20 AND v_prev_status <> 'Full' THEN
      UPDATE waste_containers_tbl
      SET status = 'Full'
      WHERE container_id = v_container_id;

      INSERT INTO system_notifications_tbl
        (Event_type, Container_name, Area_name, Created_at)
      VALUES
        ('CONTAINER_FULL', v_container_name, v_area_name, NOW());

    ELSEIF NEW.weight < 20 AND v_prev_status = 'Full' THEN
      UPDATE waste_containers_tbl
      SET status = 'Empty'
      WHERE container_id = v_container_id;
    END IF;
  END IF;
END$$
DELIMITER ;
