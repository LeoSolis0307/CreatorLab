const path = require('path');
const Busboy = require('busboy');
const { put } = require('@vercel/blob');

function safeBaseName(name) {
  const base = path.basename(String(name || 'upload'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function makeKey({ weekId, taskId, filename }) {
  const w = String(weekId || '').trim() || '1';
  const t = String(taskId || '').trim() || 'x';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 10);
  return `tareaslab/w${w}/t${t}/${stamp}__${rand}__${safeBaseName(filename)}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method not allowed' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.statusCode = 500;
    return res.json({ ok: false, error: 'Falta configurar Vercel Blob (BLOB_READ_WRITE_TOKEN).' });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    res.statusCode = 400;
    return res.json({ ok: false, error: 'Content-Type inválido. Debe ser multipart/form-data.' });
  }

  try {
    const bb = Busboy({
      headers: req.headers,
      limits: {
        files: 6,
        fileSize: 8 * 1024 * 1024
      }
    });

    const uploads = [];
    const pending = [];
    const fields = { weekId: '1', taskId: 'x' };
    let aborted = false;

    function fail(code, message) {
      if (aborted) return;
      aborted = true;
      res.statusCode = code;
      res.json({ ok: false, error: message });
    }

    bb.on('field', (name, val) => {
      if (name === 'weekId') fields.weekId = String(val || '').trim() || '1';
      if (name === 'taskId') fields.taskId = String(val || '').trim() || 'x';
    });

    bb.on('file', (_name, file, info) => {
      const { filename, mimeType } = info || {};

      if (!mimeType || !String(mimeType).startsWith('image/')) {
        file.resume();
        return;
      }

      const chunks = [];
      let total = 0;

      file.on('data', (d) => {
        total += d.length;
        chunks.push(d);
      });

      file.on('limit', () => {
        file.resume();
        fail(413, 'Imagen demasiado grande (máx 8MB).');
      });

      const p = new Promise((resolve) => {
        file.on('end', async () => {
          if (aborted) return resolve();
          if (total <= 0) return resolve();

          const key = makeKey({ weekId: fields.weekId, taskId: fields.taskId, filename });
          try {
            const result = await put(key, Buffer.concat(chunks), {
              access: 'public',
              contentType: mimeType
            });

            uploads.push({
              url: result && result.url,
              name: filename,
              size: total
            });
          } catch {
            fail(500, 'No se pudo subir la imagen a Vercel Blob.');
          }
          resolve();
        });
      });

      pending.push(p);
    });

    bb.on('filesLimit', () => {
      fail(400, 'Máximo 6 imágenes.');
    });

    bb.on('error', () => {
      fail(400, 'Error procesando el formulario.');
    });

    bb.on('finish', async () => {
      await Promise.all(pending);
      if (aborted) return;
      return res.json({ ok: true, files: uploads.filter((f) => f.url) });
    });

    req.pipe(bb);
  } catch {
    res.statusCode = 500;
    return res.json({ ok: false, error: 'Error interno.' });
  }
};
