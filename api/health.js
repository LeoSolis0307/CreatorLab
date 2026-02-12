module.exports = (_req, res) => {
  res.json({ ok: true, env: process.env.VERCEL ? 'vercel' : 'local' });
};
