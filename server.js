const path = require('path');
const http = require('http');
const express = require('express');
const multer = require('multer');
const { addSubmission, listSubmissions, validateTaskId } = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html']
}));

const UPLOAD_DIR = path.join(__dirname, 'public', 'img', 'uploads');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const safeOriginal = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    cb(null, `${stamp}__${safeOriginal}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Solo se permiten imágenes.'));
  }
});

app.post('/api/upload-image', upload.array('images', 6), (req, res) => {
  if (process.env.VERCEL) {
    return res.status(501).json({
      ok: false,
      error: 'En Vercel no se puede escribir en /public. Usa Vercel Blob si quieres subir imágenes.'
    });
  }

  const files = (req.files || []).map((f) => ({
    url: `/img/uploads/${f.filename}`,
    name: f.originalname,
    size: f.size
  }));
  return res.json({ ok: true, files });
});

app.post('/api/submit', async (req, res) => {
  const result = await addSubmission(req.body || {});
  return res.status(result.ok ? 200 : 400).json(result);
});

app.get('/api/tasks', async (req, res) => {
  const { weekId, taskId, limit } = req.query || {};
  if (taskId) {
    const result = await listSubmissions(taskId, limit, weekId || '1');
    return res.status(result.ok ? 200 : 400).json(result);
  }

  const tasks = ['1', '2', '3', '4', '5', '6'];
  const byTask = {};
  for (const t of tasks) {
    const vt = validateTaskId(t);
    const r = await listSubmissions(vt, limit, weekId || '1');
    byTask[t] = r.ok ? r.items : [];
  }
  return res.json({ ok: true, weekId: weekId || '1', byTask });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, port: PORT });
});

app.listen(PORT, () => {
  console.log(`TareasLab listo en http://localhost:${PORT}`);

  setTimeout(() => {
    const req = http.get(`http://localhost:${PORT}/api/health`, (resp) => {
      let body = '';
      resp.setEncoding('utf8');
      resp.on('data', (chunk) => (body += chunk));
      resp.on('end', () => {
        console.log(`[health] ${body}`);
      });
    });

    req.on('error', (err) => {
      console.log(`[health] no se pudo conectar: ${err.message}`);
    });
  }, 150);
});
