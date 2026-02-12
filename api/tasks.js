const { listSubmissions, validateTaskId } = require('../lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method not allowed' });
  }

  const { weekId, taskId, limit } = req.query || {};

  if (taskId) {
    const result = await listSubmissions(taskId, limit, weekId || '1');
    res.statusCode = result.ok ? 200 : 400;
    return res.json(result);
  }

  const tasks = ['1', '2', '3', '4', '5', '6'];
  const results = {};

  for (const t of tasks) {
    // validateTaskId just to be safe.
    const vt = validateTaskId(t);
    const r = await listSubmissions(vt, limit, weekId || '1');
    results[t] = r.ok ? r.items : [];
  }

  return res.json({ ok: true, weekId: weekId || '1', byTask: results });
};
