const fs = require('fs');
const path = require('path');

let kvClient = null;

function hasVercelKVEnv() {
  return Boolean(
    process.env.KV_REST_API_URL ||
      process.env.KV_URL ||
      process.env.UPSTASH_REDIS_REST_URL ||
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

async function getKV() {
  if (kvClient) return kvClient;
  if (!hasVercelKVEnv()) return null;

  try {
    // Lazy import so local dev works without KV.
    // eslint-disable-next-line global-require
    const { kv } = require('@vercel/kv');
    kvClient = kv;
    return kvClient;
  } catch (_err) {
    return null;
  }
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

function ensureLocalDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ byWeek: { "1": { byTask: { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] } } } }, null, 2), 'utf8');
  }
}

function readLocal() {
  ensureLocalDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeLocal(data) {
  ensureLocalDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function validateWeekId(weekId) {
  const w = String(weekId || '').trim();
  return w === '1' ? w : null;
}

function validateTaskId(taskId) {
  const t = String(taskId || '').trim();
  return ['1', '2', '3', '4', '5', '6'].includes(t) ? t : null;
}

function makeId() {
  // Good enough for this use-case.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeImages(images) {
  const arr = Array.isArray(images) ? images : (images ? [images] : []);
  return arr
    .map((x) => String(x || '').trim())
    .filter((x) => x.startsWith('/img/'))
    .slice(0, 12);
}

function normalizeSubmission({ weekId, taskId, studentName, notes, images }) {
  // Default to week 1 for now.
  const resolvedWeekId = String(weekId || '1').trim();
  const w = validateWeekId(resolvedWeekId);
  const t = validateTaskId(taskId);
  const name = String(studentName || '').trim();
  const text = String(notes || '').trim();
  const img = normalizeImages(images);

  if (!w) return { ok: false, error: 'weekId inválido.' };
  if (!t) return { ok: false, error: 'taskId inválido. Usa 1–6.' };
  if (!name) return { ok: false, error: 'Pon tu nombre en el campo "Nombre".' };
  if (!text) return { ok: false, error: 'Escribe el texto de tu entrega.' };

  return {
    ok: true,
    submission: {
      id: makeId(),
      weekId: w,
      taskId: t,
      studentName: name,
      notes: text,
      images: img,
      createdAt: new Date().toISOString()
    }
  };
}

async function addSubmission(input) {
  const normalized = normalizeSubmission(input);
  if (!normalized.ok) return normalized;

  const submission = normalized.submission;
  const mode = String((input && input.mode) || 'append');
  const kv = await getKV();

  if (process.env.VERCEL && !kv) {
    return {
      ok: false,
      error: 'En Vercel necesitas configurar Vercel KV para guardar las entregas.'
    };
  }

  if (kv) {
    const key = `tareaslab:w${submission.weekId}:t${submission.taskId}`;
    if (mode === 'replace') {
      await kv.del(key);
    }
    await kv.lpush(key, JSON.stringify(submission));
    await kv.ltrim(key, 0, 49);
    return { ok: true, submission, storage: 'kv' };
  }

  const data = readLocal();
  data.byWeek = data.byWeek || {};
  data.byWeek[submission.weekId] = data.byWeek[submission.weekId] || { byTask: {} };
  data.byWeek[submission.weekId].byTask = data.byWeek[submission.weekId].byTask || {};

  const existing = data.byWeek[submission.weekId].byTask[submission.taskId];
  let arr = [];
  if (Array.isArray(existing)) {
    arr = existing;
  } else if (existing && typeof existing === 'object') {
    arr = [existing];
  }

  if (mode === 'replace') {
    arr = [submission];
  } else {
    arr.unshift(submission);
  }

  data.byWeek[submission.weekId].byTask[submission.taskId] = arr.slice(0, 50);
  writeLocal(data);

  return { ok: true, submission, storage: 'local' };
}

async function listSubmissions(taskId, limit = 20, weekId = '1') {
  const w = validateWeekId(weekId);
  const t = validateTaskId(taskId);
  if (!w) return { ok: false, error: 'weekId inválido.' };
  if (!t) return { ok: false, error: 'taskId inválido. Usa 1–6.' };

  const lim = Math.max(1, Math.min(50, Number(limit) || 20));
  const kv = await getKV();

  if (process.env.VERCEL && !kv) {
    return {
      ok: false,
      error: 'En Vercel necesitas configurar Vercel KV para listar entregas.'
    };
  }

  if (kv) {
    const key = `tareaslab:w${w}:t${t}`;
    let rawItems = [];
    try {
      rawItems = await kv.lrange(key, 0, lim - 1);
    } catch {
      rawItems = [];
    }

    let items = (rawItems || [])
      .map((x) => {
        try {
          return JSON.parse(x);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Backward compatibility: previous versions stored a single object with kv.set
    if (items.length === 0) {
      try {
        const legacy = await kv.get(key);
        if (legacy && typeof legacy === 'object') items = [legacy];
      } catch {
        // ignore
      }
    }

    return { ok: true, weekId: w, taskId: t, items, storage: 'kv' };
  }

  const data = readLocal();
  const value = (data.byWeek && data.byWeek[w] && data.byWeek[w].byTask) ? data.byWeek[w].byTask[t] : null;
  const items = Array.isArray(value)
    ? value.slice(0, lim)
    : (value && typeof value === 'object')
      ? [value]
      : [];
  return { ok: true, weekId: w, taskId: t, items, storage: 'local' };
}

module.exports = {
  addSubmission,
  listSubmissions,
  validateTaskId,
  validateWeekId
};
