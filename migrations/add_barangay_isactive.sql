-- Migration: Add IsActive column to barangay_tbl and clean up existing data
-- Date: 2026-03-24
-- Description: Adds IsActive column for barangay activation/deactivation feature

-- Step 1: Add IsActive column
ALTER TABLE `barangay_tbl` ADD COLUMN `IsActive` tinyint(1) NOT NULL DEFAULT 1;

-- Step 2: Delete all existing barangays except IDs 12 and 14
DELETE FROM barangay_tbl WHERE Barangay_id NOT IN (12, 14);

-- Step 3: Update barangay names to match their IDs (for consistency)
UPDATE barangay_tbl SET Barangay_Name = 'Barangay 12' WHERE Barangay_id = 12;
UPDATE barangay_tbl SET Barangay_Name = 'Barangay 14' WHERE Barangay_id = 14;

-- Step 4: Ensure the kept barangays are active
UPDATE barangay_tbl SET IsActive = 1 WHERE Barangay_id IN (12, 14);

-- Verify the migration
SELECT * FROM barangay_tbl;
