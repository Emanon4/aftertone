ALTER TABLE api_jobs ADD COLUMN model_config_json TEXT;
ALTER TABLE api_jobs ADD COLUMN key_fingerprint TEXT;
ALTER TABLE api_jobs ADD COLUMN quota_bucket TEXT NOT NULL DEFAULT 'site';

-- Keep api_daily_budget and its existing counts for site-funded jobs.
-- Personal API keys have independent, atomic UTC-day quotas.
CREATE TABLE IF NOT EXISTS api_personal_daily_budget (
 bucket TEXT NOT NULL,
 day TEXT NOT NULL,
 count INTEGER NOT NULL CHECK(count >= 0 AND count <= 30),
 PRIMARY KEY(bucket,day)
);
