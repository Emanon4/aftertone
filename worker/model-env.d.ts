interface AftertoneApiEnv {
 /** Deployment-only comma-separated exact HTTPS base URLs for trusted additional providers. */
 MODEL_BASE_URL_ALLOWLIST?: string;
 /** Comma-separated exact front-end origins allowed by CORS (local hosts are always allowed). */
 ALLOWED_ORIGINS?: string;
 /** Candidates scored by the model each round after metadata pre-ranking (50–5000, default 600). */
 CANDIDATE_LIMIT?: string;
 SITE_DAILY_ROUNDS?: string;
 PERSONAL_DAILY_ROUNDS?: string;
 IP_DAILY_ROUNDS?: string;
 PERSONAL_GLOBAL_DAILY_ROUNDS?: string;
 /** Two-letter iTunes storefront used for Chinese search and lookups (default SG). */
 ITUNES_COUNTRY?: string;
 /** Optional Cloudflare Turnstile: both must be set to require a challenge before paid work. */
 TURNSTILE_SITE_KEY?: string;
 TURNSTILE_SECRET_KEY?: string;
 /** Secret salt for daily per-IP hashes. */
 IP_HASH_SALT?: string;
 /** Durable Object namespace that drives job steps server-side. */
 JOB_RUNNER?: DurableObjectNamespace;
 /** Optional R2 bucket holding catalog/*.json instead of static assets. */
 CATALOG?: R2Bucket;
}
