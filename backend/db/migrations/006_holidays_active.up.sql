ALTER TABLE holidays
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX idx_holidays_active ON holidays(is_active);
