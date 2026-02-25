ALTER TABLE settings
  ADD COLUMN annual_leave_accrual_policy VARCHAR(32) NOT NULL DEFAULT 'PRO_RATA',
  ADD COLUMN carry_over_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN carry_over_limit_hours DOUBLE NOT NULL DEFAULT 0;
