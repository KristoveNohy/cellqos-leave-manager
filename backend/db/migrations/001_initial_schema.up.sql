-- Enable UUID extension for potential future use
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Enable pgcrypto for password hashing and token utilities
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE user_role AS ENUM ('EMPLOYEE', 'MANAGER');
CREATE TYPE leave_type AS ENUM ('ANNUAL_LEAVE', 'SICK_LEAVE', 'HOME_OFFICE', 'UNPAID_LEAVE', 'OTHER');
CREATE TYPE leave_status AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Teams table
CREATE TABLE teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  max_concurrent_leaves INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Users table (user_id is string for auth compatibility)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'EMPLOYEE',
  team_id BIGINT REFERENCES teams(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Leave requests table
CREATE TABLE leave_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_half_day_start BOOLEAN NOT NULL DEFAULT FALSE,
  is_half_day_end BOOLEAN NOT NULL DEFAULT FALSE,
  status leave_status NOT NULL DEFAULT 'DRAFT',
  reason TEXT,
  manager_comment TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TIMESTAMP,
  computed_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  attachment_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

-- Holidays table
CREATE TABLE holidays (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_company_holiday BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Leave balances table
CREATE TABLE leave_balances (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  allowance_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  used_days DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, year)
);

-- Audit logs table
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_holidays_date ON holidays(date);
CREATE INDEX idx_leave_balances_user_year ON leave_balances(user_id, year);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read_at);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
