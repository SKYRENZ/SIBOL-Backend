-- Credit Score System Database Migration
-- Run this script to add credit_score column to accounts_tbl

-- Add credit_score column if it doesn't exist
ALTER TABLE accounts_tbl ADD COLUMN credit_score DECIMAL(5,2) DEFAULT 100.00;

-- Optional: Add tracking columns for last activity dates
ALTER TABLE accounts_tbl ADD COLUMN last_input_date DATETIME NULL;
ALTER TABLE accounts_tbl ADD COLUMN last_collection_date DATETIME NULL;

-- Create index for credit_score queries (for quick sorting/filtering by operators)
CREATE INDEX idx_credit_score ON accounts_tbl(credit_score DESC);

-- Optional: Verify the columns were added
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'accounts_tbl' AND COLUMN_NAME IN ('credit_score', 'last_input_date', 'last_collection_date');