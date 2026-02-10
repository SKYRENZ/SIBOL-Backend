START TRANSACTION;

-- Rename ESP32 sensor table
RENAME TABLE esp32_sensor_data TO weight_sensor_tbl;

-- Add QR image column to weight sensor data
ALTER TABLE weight_sensor_tbl
  ADD COLUMN qr_image LONGTEXT NULL AFTER weight;

-- Rename QR scans table
RENAME TABLE qr_scans_tbl TO household_wasteinput_tbl;

-- Add QR image column to household waste input
ALTER TABLE household_wasteinput_tbl
  ADD COLUMN QR_image LONGTEXT NULL AFTER Points_Awarded;

COMMIT;
