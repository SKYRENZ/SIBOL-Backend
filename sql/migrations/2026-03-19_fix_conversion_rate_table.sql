-- Fix conversion_rate_tbl schema to use Barangay_id as PRIMARY KEY
-- Drop and recreate the table with correct schema

DROP TABLE IF EXISTS conversion_rate_tbl;

CREATE TABLE conversion_rate_tbl (
  Barangay_id INT PRIMARY KEY,
  points_per_kg DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Ensure conversion_audit_tbl exists with correct schema
DROP TABLE IF EXISTS conversion_audit_tbl;

CREATE TABLE conversion_audit_tbl (
  id INT AUTO_INCREMENT PRIMARY KEY,
  Barangay_id INT NULL,
  old_points_per_kg DECIMAL(10,2) NULL,
  new_points_per_kg DECIMAL(10,2) NOT NULL,
  remark VARCHAR(255) NOT NULL,
  changed_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (Barangay_id) REFERENCES conversion_rate_tbl(Barangay_id) ON DELETE SET NULL
);

-- Insert default conversion rate for barangays if needed
INSERT IGNORE INTO conversion_rate_tbl (Barangay_id, points_per_kg) 
SELECT DISTINCT Barangay_id, 5 FROM users_tbl WHERE Barangay_id IS NOT NULL;
