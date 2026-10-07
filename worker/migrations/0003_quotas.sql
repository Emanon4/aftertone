-- Daily limits move from fixed schema CHECKs to deployment variables.
-- Rebuild the two budget tables without the hard upper bound and keep existing counts.
CREATE TABLE api_daily_budget_v3 (
 day TEXT PRIMARY KEY,
 count INTEGER NOT NULL CHECK(count >= 0)
);
INSERT INTO api_daily_budget_v3(day,count) SELECT day,count FROM api_daily_budget;
DROP TABLE api_daily_budget;
ALTER TABLE api_daily_budget_v3 RENAME TO api_daily_budget;

CREATE TABLE api_personal_daily_budget_v3 (
 bucket TEXT NOT NULL,
 day TEXT NOT NULL,
 count INTEGER NOT NULL CHECK(count >= 0),
 PRIMARY KEY(bucket,day)
);
INSERT INTO api_personal_daily_budget_v3(bucket,day,count) SELECT bucket,day,count FROM api_personal_daily_budget;
DROP TABLE api_personal_daily_budget;
ALTER TABLE api_personal_daily_budget_v3 RENAME TO api_personal_daily_budget;

-- Abuse limits: salted per-IP hashes and the global personal-key ceiling.
-- Buckets never contain a raw IP address or API key.
CREATE TABLE IF NOT EXISTS api_rate_budget (
 bucket TEXT NOT NULL,
 day TEXT NOT NULL,
 count INTEGER NOT NULL CHECK(count >= 0),
 PRIMARY KEY(bucket,day)
);
CREATE INDEX IF NOT EXISTS api_rate_budget_day ON api_rate_budget(day);
