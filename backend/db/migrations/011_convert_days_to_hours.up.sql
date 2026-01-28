DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'manual_leave_allowance_days'
  ) THEN
    ALTER TABLE users RENAME COLUMN manual_leave_allowance_days TO manual_leave_allowance_hours;
    UPDATE users
    SET manual_leave_allowance_hours = manual_leave_allowance_hours * 8
    WHERE manual_leave_allowance_hours IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'computed_days'
  ) THEN
    ALTER TABLE leave_requests RENAME COLUMN computed_days TO computed_hours;
    UPDATE leave_requests
    SET computed_hours = computed_hours * 8;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_balances' AND column_name = 'allowance_days'
  ) THEN
    ALTER TABLE leave_balances RENAME COLUMN allowance_days TO allowance_hours;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_balances' AND column_name = 'used_days'
  ) THEN
    ALTER TABLE leave_balances RENAME COLUMN used_days TO used_hours;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_balances' AND column_name = 'allowance_hours'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_balances' AND column_name = 'used_hours'
  ) THEN
    UPDATE leave_balances
    SET allowance_hours = allowance_hours * 8,
        used_hours = used_hours * 8;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'settings' AND column_name = 'carry_over_limit_days'
  ) THEN
    ALTER TABLE settings RENAME COLUMN carry_over_limit_days TO carry_over_limit_hours;
    UPDATE settings
    SET carry_over_limit_hours = carry_over_limit_hours * 8;
  END IF;
END $$;
