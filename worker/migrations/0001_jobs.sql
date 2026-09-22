CREATE TABLE IF NOT EXISTS api_daily_budget (
 day TEXT PRIMARY KEY,
 count INTEGER NOT NULL CHECK(count >= 0 AND count <= 30)
);
CREATE TABLE IF NOT EXISTS api_jobs (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('pending','running','done','failed','cancelled','expired')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 finished_at INTEGER,
 seed_json TEXT NOT NULL,
 direction TEXT NOT NULL,
 notes TEXT NOT NULL,
 feedback_json TEXT NOT NULL,
 total_count INTEGER NOT NULL,
 total_batches INTEGER NOT NULL,
 batch_size INTEGER NOT NULL,
 total_steps INTEGER NOT NULL,
 next_step INTEGER NOT NULL DEFAULT 0,
 scored_count INTEGER NOT NULL DEFAULT 0,
 completed_batches INTEGER NOT NULL DEFAULT 0,
 request_count INTEGER NOT NULL DEFAULT 0,
 failed_request_count INTEGER NOT NULL DEFAULT 0,
 input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0,
 usage_complete INTEGER NOT NULL DEFAULT 1,
 jev_ms INTEGER NOT NULL DEFAULT 0,
 top_json TEXT NOT NULL DEFAULT '[]',
 models_json TEXT NOT NULL DEFAULT '[]',
 library_count INTEGER NOT NULL,
 recall_json TEXT NOT NULL,
 remaining INTEGER NOT NULL,
 lease_token TEXT,
 lease_until INTEGER,
 error TEXT
);
CREATE INDEX IF NOT EXISTS api_jobs_expires ON api_jobs(expires_at);
CREATE TABLE IF NOT EXISTS api_job_steps (
 job_id TEXT NOT NULL REFERENCES api_jobs(id) ON DELETE CASCADE,
 step_index INTEGER NOT NULL,
 candidates_json TEXT NOT NULL,
 PRIMARY KEY(job_id,step_index)
);
