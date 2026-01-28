-- Insert Engineering team
INSERT INTO teams (id, name, max_concurrent_leaves) VALUES
  (1, 'Engineering', 2);

-- Insert demo users (IDs are stable for local development)
INSERT INTO users (id, email, name, role, team_id, birth_date, has_child) VALUES
  ('user_manager_placeholder', 'manager@cellqos.com', 'Manager User', 'MANAGER', 1, '1985-03-10', true),
  ('user_anna_placeholder', 'anna@cellqos.com', 'Anna Novakova', 'EMPLOYEE', 1, '1994-06-12', false),
  ('user_peter_placeholder', 'peter@cellqos.com', 'Peter Horvath', 'EMPLOYEE', 1, '1991-11-03', true),
  ('user_lucia_placeholder', 'lucia@cellqos.com', 'Lucia Kovacova', 'EMPLOYEE', 1, '1998-02-25', false);

-- Insert Slovak holidays for 2024-2025
INSERT INTO holidays (date, name, is_company_holiday) VALUES
  -- 2024
  ('2024-01-01', 'Deň vzniku Slovenskej republiky', true),
  ('2024-01-06', 'Zjavenie Pána (Traja králi)', true),
  ('2024-03-29', 'Veľký piatok', true),
  ('2024-04-01', 'Veľkonočný pondelok', true),
  ('2024-05-01', 'Sviatok práce', true),
  ('2024-05-08', 'Deň víťazstva nad fašizmom', true),
  ('2024-07-05', 'Sviatok svätého Cyrila a Metoda', true),
  ('2024-08-29', 'Výročie SNP', true),
  ('2024-09-01', 'Deň Ústavy SR', true),
  ('2024-09-15', 'Sedembolestná Panna Mária', true),
  ('2024-11-01', 'Sviatok Všetkých svätých', true),
  ('2024-11-17', 'Deň boja za slobodu a demokraciu', true),
  ('2024-12-24', 'Štedrý deň', true),
  ('2024-12-25', 'Prvý sviatok vianočný', true),
  ('2024-12-26', 'Druhý sviatok vianočný', true),
  -- 2025
  ('2025-01-01', 'Deň vzniku Slovenskej republiky', true),
  ('2025-01-06', 'Zjavenie Pána (Traja králi)', true),
  ('2025-04-18', 'Veľký piatok', true),
  ('2025-04-21', 'Veľkonočný pondelok', true),
  ('2025-05-01', 'Sviatok práce', true),
  ('2025-05-08', 'Deň víťazstva nad fašizmom', true),
  ('2025-07-05', 'Sviatok svätého Cyrila a Metoda', true),
  ('2025-08-29', 'Výročie SNP', true),
  ('2025-09-01', 'Deň Ústavy SR', true),
  ('2025-09-15', 'Sedembolestná Panna Mária', true),
  ('2025-11-01', 'Sviatok Všetkých svätých', true),
  ('2025-11-17', 'Deň boja za slobodu a demokraciu', true),
  ('2025-12-24', 'Štedrý deň', true),
  ('2025-12-25', 'Prvý sviatok vianočný', true),
  ('2025-12-26', 'Druhý sviatok vianočný', true);

-- Insert leave balances for 2024-2025
INSERT INTO leave_balances (user_id, year, allowance_hours, used_hours) VALUES
  ('user_anna_placeholder', 2024, 160, 40),
  ('user_peter_placeholder', 2024, 160, 24),
  ('user_lucia_placeholder', 2024, 160, 56),
  ('user_anna_placeholder', 2025, 160, 0),
  ('user_peter_placeholder', 2025, 160, 0),
  ('user_lucia_placeholder', 2025, 160, 0);

-- Insert demo leave requests
INSERT INTO leave_requests (
  user_id, type, start_date, end_date, 
  status, reason, computed_hours, approved_by, approved_at
) VALUES
  -- Anna's approved vacation
  ('user_anna_placeholder', 'ANNUAL_LEAVE', '2024-12-23', '2024-12-27', 
   'APPROVED', 'Christmas vacation', 24, 'user_manager_placeholder', NOW() - INTERVAL '2 days'),
  
  -- Peter's pending request
  ('user_peter_placeholder', 'ANNUAL_LEAVE', '2025-01-13', '2025-01-17',
   'PENDING', 'Winter break', 40, NULL, NULL),
  
  -- Lucia's draft request
  ('user_lucia_placeholder', 'ANNUAL_LEAVE', '2025-02-10', '2025-02-14',
   'DRAFT', 'Planning ahead', 40, NULL, NULL),
  
  -- Anna's half-day sick leave
  ('user_anna_placeholder', 'SICK_LEAVE', '2024-12-15', '2024-12-15',
   'APPROVED', 'Doctor appointment', 4, 'user_manager_placeholder', NOW() - INTERVAL '5 days'),
  
  -- Peter's rejected request (overlapping with team limit)
  ('user_peter_placeholder', 'ANNUAL_LEAVE', '2024-12-23', '2024-12-27',
   'REJECTED', 'Holiday season', 24, 'user_manager_placeholder', NOW() - INTERVAL '3 days');
