-- Insert Engineering team
INSERT INTO teams (id, name, max_concurrent_leaves) VALUES
  (1, 'Engineering', 2);

-- Insert demo users (IDs are stable for local development)
INSERT INTO users (id, email, name, role, team_id) VALUES
  ('user_manager_placeholder', 'manager@cellqos.com', 'Manager User', 'MANAGER', 1),
  ('user_anna_placeholder', 'anna@cellqos.com', 'Anna Novakova', 'EMPLOYEE', 1),
  ('user_peter_placeholder', 'peter@cellqos.com', 'Peter Horvath', 'EMPLOYEE', 1),
  ('user_lucia_placeholder', 'lucia@cellqos.com', 'Lucia Kovacova', 'EMPLOYEE', 1);

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
INSERT INTO leave_balances (user_id, year, allowance_days, used_days) VALUES
  ('user_anna_placeholder', 2024, 20, 5),
  ('user_peter_placeholder', 2024, 20, 3),
  ('user_lucia_placeholder', 2024, 20, 7),
  ('user_anna_placeholder', 2025, 20, 0),
  ('user_peter_placeholder', 2025, 20, 0),
  ('user_lucia_placeholder', 2025, 20, 0);

-- Insert demo leave requests
INSERT INTO leave_requests (
  user_id, type, start_date, end_date, 
  status, reason, computed_days, approved_by, approved_at
) VALUES
  -- Anna's approved vacation
  ('user_anna_placeholder', 'ANNUAL_LEAVE', '2024-12-23', '2024-12-27', 
   'APPROVED', 'Christmas vacation', 3, 'user_manager_placeholder', NOW() - INTERVAL '2 days'),
  
  -- Peter's pending request
  ('user_peter_placeholder', 'ANNUAL_LEAVE', '2025-01-13', '2025-01-17',
   'PENDING', 'Winter break', 5, NULL, NULL),
  
  -- Lucia's draft request
  ('user_lucia_placeholder', 'ANNUAL_LEAVE', '2025-02-10', '2025-02-14',
   'DRAFT', 'Planning ahead', 5, NULL, NULL),
  
  -- Anna's half-day sick leave
  ('user_anna_placeholder', 'SICK_LEAVE', '2024-12-15', '2024-12-15',
   'APPROVED', 'Doctor appointment', 0.5, 'user_manager_placeholder', NOW() - INTERVAL '5 days'),
  
  -- Peter's rejected request (overlapping with team limit)
  ('user_peter_placeholder', 'ANNUAL_LEAVE', '2024-12-23', '2024-12-27',
   'REJECTED', 'Holiday season', 3, 'user_manager_placeholder', NOW() - INTERVAL '3 days');
