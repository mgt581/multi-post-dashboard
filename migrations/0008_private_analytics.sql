CREATE TABLE IF NOT EXISTS analytics_seo_events (
 id TEXT PRIMARY KEY, user_id TEXT, attribution TEXT NOT NULL, created_at INTEGER NOT NULL,
 provider TEXT CHECK(provider IN ('openai','cloudflare','local') OR provider IS NULL), attempted TEXT NOT NULL,
 openai_success INTEGER, openai_error TEXT, cloudflare_success INTEGER, cloudflare_error TEXT,
 local_used INTEGER NOT NULL, duration_ms INTEGER NOT NULL, mode TEXT NOT NULL, model TEXT,
 success INTEGER NOT NULL, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, estimated_cost_usd REAL
);
CREATE INDEX IF NOT EXISTS analytics_seo_user_time ON analytics_seo_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS analytics_seo_time ON analytics_seo_events(created_at);
CREATE TABLE IF NOT EXISTS analytics_activity (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL, platform TEXT,
 created_at INTEGER NOT NULL, http_success INTEGER NOT NULL, status_class TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_activity_user_time ON analytics_activity(user_id,created_at);
