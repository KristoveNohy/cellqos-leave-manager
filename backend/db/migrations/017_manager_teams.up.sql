CREATE TABLE IF NOT EXISTS manager_teams (
  manager_user_id TEXT NOT NULL,
  team_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (manager_user_id, team_id),
  CONSTRAINT fk_manager_teams_user
    FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_manager_teams_team
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manager_teams_team_id ON manager_teams(team_id);
