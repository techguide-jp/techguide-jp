CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  github_login text NOT NULL,
  github_name text,
  github_avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_github_login_idx
  ON auth_sessions (github_login);

CREATE TABLE IF NOT EXISTS work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_login text NOT NULL,
  repository text NOT NULL,
  issue_number integer NOT NULL,
  issue_title text NOT NULL,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  created_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  excluded_at timestamp with time zone,
  exclude_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_assignee_issue_open_unique_idx
  ON work_sessions (assignee_login, repository, issue_number)
  WHERE ended_at IS NULL AND excluded_at IS NULL;

CREATE INDEX IF NOT EXISTS work_sessions_assignee_idx
  ON work_sessions (assignee_login);

CREATE TYPE work_log_change_request_type AS ENUM ('add', 'edit', 'exclude');
CREATE TYPE work_log_change_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS work_log_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type work_log_change_request_type NOT NULL,
  status work_log_change_request_status NOT NULL DEFAULT 'pending',
  assignee_login text NOT NULL,
  repository text NOT NULL,
  issue_number integer NOT NULL,
  issue_title text NOT NULL,
  target_session_id uuid REFERENCES work_sessions(id),
  requested_started_at timestamp with time zone,
  requested_ended_at timestamp with time zone,
  reason text NOT NULL,
  requested_by text NOT NULL,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_log_change_requests_status_idx
  ON work_log_change_requests (status);

CREATE INDEX IF NOT EXISTS work_log_change_requests_assignee_idx
  ON work_log_change_requests (assignee_login);

CREATE TABLE IF NOT EXISTS monthly_settlement_snapshots (
  month text NOT NULL,
  assignee_login text NOT NULL,
  snapshot jsonb NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (month, assignee_login)
);
