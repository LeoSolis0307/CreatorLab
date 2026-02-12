const { addSubmission } = require('../lib/store');

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
    const result = await addSubmission(body);
    res.statusCode = result.ok ? 200 : 400;
    return res.json(result);
  } catch (_err) {
    res.statusCode = 400;
    return res.json({ ok: false, error: 'JSON inválido.' });
  }
};
