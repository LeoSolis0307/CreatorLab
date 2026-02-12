module.exports = (_req, res) => {
  const kvConfigured = Boolean(
    process.env.KV_REST_API_URL ||
      process.env.KV_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.UPSTASH_REDIS_REST_TOKEN
  );

  res.json({ ok: true, env: process.env.VERCEL ? 'vercel' : 'local', kvConfigured });
};
