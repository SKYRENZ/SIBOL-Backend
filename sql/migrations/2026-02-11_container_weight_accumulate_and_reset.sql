-- Migration: accumulate container waste (kg) and reset on collection
-- Date: 2026-02-11
--
-- Goal:
-- - Each insert into weight_sensor_tbl increments the container's current_weight_kg
-- - Still store the latest single reading in latest_weight_kg
-- - When an area collection is recorded, reset all containers in that area to 0

-- 1) Add current_weight_kg accumulator if missing
ALTER TABLE waste_containers_tbl
  ADD COLUMN current_weight_kg DECIMAL(10,3) NOT NULL DEFAULT 0 AFTER latest_weight_kg;

CREATE INDEX idx_waste_containers_area_current_weight
  ON waste_containers_tbl (area_id, current_weight_kg);

-- 2) Recreate sensor trigger to accumulate
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
  DECLARE v_prev_total DECIMAL(10,3);
  DECLARE v_new_total DECIMAL(10,3);
  DECLARE v_found INT DEFAULT 1;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_found = 0;

  -- Find the container attached to this device_id
  SELECT wc.container_id,
         wc.container_name,
         a.Area_Name,
         wc.status,
         COALESCE(wc.current_weight_kg, 0)
    INTO v_container_id, v_container_name, v_area_name, v_prev_status, v_prev_total
  FROM waste_containers_tbl wc
  LEFT JOIN area_tbl a ON wc.area_id = a.Area_id
  WHERE wc.device_id = NEW.device_id
  LIMIT 1;

  IF v_found = 1 THEN
    SET v_new_total = v_prev_total + COALESCE(NEW.weight, 0);

    -- Cache: latest single reading + last timestamp + accumulated current weight
    UPDATE waste_containers_tbl
    SET latest_weight_kg = NEW.weight,
        current_weight_kg = v_new_total,
        last_weight_at = NEW.created_at
    WHERE container_id = v_container_id;

    -- Fullness transitions + alert (based on accumulated weight)
    IF v_new_total >= 20 AND v_prev_status <> 'Full' THEN
      UPDATE waste_containers_tbl
      SET status = 'Full'
      WHERE container_id = v_container_id;

      INSERT INTO system_notifications_tbl
        (Event_type, Container_name, Area_name, Created_at)
      VALUES
        ('CONTAINER_FULL', v_container_name, v_area_name, NOW());

    ELSEIF v_new_total < 20 AND v_prev_status = 'Full' THEN
      UPDATE waste_containers_tbl
      SET status = 'Empty'
      WHERE container_id = v_container_id;
    END IF;
  END IF;
END$$
DELIMITER ;

-- 3) Reset container accumulated weight after an area collection is recorded
DROP TRIGGER IF EXISTS trg_waste_collection_after_insert;

DELIMITER $$
CREATE TRIGGER trg_waste_collection_after_insert
AFTER INSERT ON waste_collection_tbl
FOR EACH ROW
BEGIN
  -- Reset all containers for this area (collection empties containers)
  UPDATE waste_containers_tbl
  SET current_weight_kg = 0,
      status = 'Empty'
  WHERE area_id = NEW.area_id
    AND device_id IS NOT NULL;
END$$
DELIMITER ;
