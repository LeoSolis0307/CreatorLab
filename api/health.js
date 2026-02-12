module.exports = (_req, res) => {
  const kvEnv = {
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    KV_REST_API_READ_ONLY_TOKEN: Boolean(process.env.KV_REST_API_READ_ONLY_TOKEN),
    KV_URL: Boolean(process.env.KV_URL),
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
  };

  const kvConfigured = Object.values(kvEnv).some(Boolean);

  res.json({ ok: true, env: process.env.VERCEL ? 'vercel' : 'local', kvConfigured, kvEnv });
};
