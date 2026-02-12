const toastEl = document.getElementById('toast');
let activeWeekId = '1';
const fixedStudentName = (document.body && document.body.dataset && document.body.dataset.studentName)
  ? document.body.dataset.studentName
  : 'leo_solis';

const latestByTask = new Map();

function getTaskDetailsById(taskId) {
  const t = String(taskId);
  return document.querySelector(`details.task[data-task-id="${t}"]`);
}

function isTaskMultiple(taskId) {
  const details = getTaskDetailsById(taskId);
  return details ? details.getAttribute('data-allow-multiple') === 'true' : false;
}

function isTaskOneSentence(taskId) {
  const details = getTaskDetailsById(taskId);
  return details ? details.getAttribute('data-one-sentence') === 'true' : false;
}

function getForm(taskId) {
  return document.querySelector(`details.task form[data-task-form] input[name="taskId"][value="${taskId}"]`)?.closest('form');
}

function getSavedImagesContainer(form) {
  return form ? form.querySelector('[data-saved-images]') : null;
}

function setKeptImages(form, urls) {
  if (!form) return;
  form.dataset.keptImages = JSON.stringify(urls || []);
}

function getKeptImages(form) {
  if (!form) return [];
  try {
    const raw = form.dataset.keptImages;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function renderSavedImages(form, urls) {
  const box = getSavedImagesContainer(form);
  if (!box) return;

  const items = (urls || []).filter((u) => typeof u === 'string' && (u.startsWith('/img/') || /^https?:\/\//i.test(u)));
  if (items.length === 0) {
    box.innerHTML = '';
    return;
  }

  box.innerHTML = items
    .map(
      (u) => `
        <span class="thumbWrap">
          <a class="thumb" href="${escapeAttr(u)}" data-lightbox="${escapeAttr(u)}" download>
            <img src="${escapeAttr(u)}" alt="Adjunto" />
          </a>
          <button class="thumbRemove" type="button" data-remove-img="${escapeAttr(u)}" aria-label="Quitar imagen">×</button>
        </span>
      `
    )
    .join('');
}

async function uploadImages(files, { weekId, taskId } = {}) {
  const list = Array.from(files || []);
  if (list.length === 0) return [];

  const fd = new FormData();
  // Optional metadata so Vercel Blob can store files grouped by task.
  if (weekId != null) fd.append('weekId', String(weekId));
  if (taskId != null) fd.append('taskId', String(taskId));
  for (const f of list) fd.append('images', f);

  const res = await fetch('/api/upload-image', { method: 'POST', body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    const err = (data && data.error) ? data.error : 'No se pudo subir la imagen.';
    throw new Error(err);
  }
  return (data.files || []).map((x) => x.url).filter(Boolean);
}

function toast(message, tone = 'info') {
  if (!toastEl) return;
  const prefix = tone === 'ok' ? 'Listo: ' : tone === 'bad' ? 'Ups: ' : '';
  toastEl.textContent = `${prefix}${message}`;
  toastEl.classList.add('show');
  window.clearTimeout(toastEl._t);
  toastEl._t = window.setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function setStatus(form, msg, tone = 'info') {
  const status = form.querySelector('.status');
  if (!status) return;
  status.textContent = msg;
  status.style.color = tone === 'ok' ? 'rgba(78,240,163,.92)' : tone === 'bad' ? 'rgba(255,61,129,.95)' : 'rgba(255,255,255,.68)';
}

function lockForm(form) {
  form.classList.add('hidden');
}

function unlockForm(form) {
  form.classList.remove('hidden');
}

async function handleSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('button[type="submit"]');

  const studentName = fixedStudentName;
  const taskId = form.querySelector('input[name="taskId"]').value;

  let notes = form.querySelector('textarea[name="notes"]').value.trim();
  if (isTaskOneSentence(taskId)) {
    // Recommendation only: warn if it looks like multiple sentences/lines.
    // Avoid false positives from URLs like https://www.youtube.com/...
    const withoutUrls = notes.replace(/https?:\/\/\S+/gi, '');
    const sentenceEndings = (withoutUrls.match(/\.(?=\s|$)/g) || []).length
      + (withoutUrls.match(/[!?]+(?=\s|$)/g) || []).length;
    const nonEmptyLines = notes.split(/\n+/).filter((l) => l.trim().length > 0).length;

    if (sentenceEndings > 1 || nonEmptyLines > 1) {
      toast('Tip: esta tarea sugiere una sola frase (igual se envía).', 'info');
    }
  }

  const allowMultiple = isTaskMultiple(taskId);
  const mode = allowMultiple ? 'append' : 'replace';

  const imageInput = form.querySelector('input[name="images"]');
  const kept = getKeptImages(form);

  btn.disabled = true;
  setStatus(form, 'Enviando...', 'info');

  try {
    const uploaded = imageInput && imageInput.files && imageInput.files.length
      ? await uploadImages(imageInput.files, { weekId: activeWeekId, taskId })
      : [];

    const images = [...kept, ...uploaded];
    const payload = { weekId: activeWeekId, taskId, studentName, notes, images, mode };

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || !data || !data.ok) {
      const err = (data && data.error) ? data.error : 'No se pudo enviar.';
      setStatus(form, err, 'bad');
      toast(err, 'bad');
      return;
    }

    form.reset();
    setKeptImages(form, []);
    renderSavedImages(form, []);
    setStatus(form, 'Guardado ✅', 'ok');
    toast(`Tarea ${taskId} entregada`, 'ok');

    await refreshTask(taskId);
    if (!allowMultiple) {
      lockForm(form);
    }
  } catch (err) {
    const msg = (err && err.message) ? err.message : 'Error de red o servidor.';
    setStatus(form, msg, 'bad');
    toast(msg, 'bad');
  } finally {
    btn.disabled = false;
  }
}

function fmtWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return String(iso || '');
  }
}

function renderTask(taskId, items) {
  const feed = document.querySelector(`[data-feed="${taskId}"]`);
  if (!feed) return;

  const form = getForm(taskId);
  const allowMultiple = isTaskMultiple(taskId);

  if (!items || items.length === 0) {
    feed.innerHTML = `<div class="empty">Aún no has enviado respuesta.</div>`;
    if (form) unlockForm(form);
    if (form) {
      setKeptImages(form, []);
      renderSavedImages(form, []);
    }
    return;
  }

  if (allowMultiple) {
    feed.innerHTML = items
      .map((it) => {
        const when = (it && it.createdAt) ? fmtWhen(it.createdAt) : '';
        const notes = (it && it.notes) ? String(it.notes) : '';
        const imgs = (it && Array.isArray(it.images)) ? it.images : [];
        const thumbs = imgs.length
          ? `<div class="thumbs">${imgs.map((u) => `
              <a class="thumb" href="${escapeAttr(u)}" data-lightbox="${escapeAttr(u)}" download>
                <img src="${escapeAttr(u)}" alt="Adjunto" />
              </a>
            `).join('')}</div>`
          : '';
        return `
          <div class="item">
            <div class="itemTop">
              <div class="who">${escapeHtml(fixedStudentName)}</div>
              <div class="when">${escapeHtml(when)}</div>
            </div>
            <div class="notes">${escapeHtml(notes)}</div>
            ${thumbs}
          </div>
        `;
      })
      .join('');

    if (form) {
      unlockForm(form);
      setStatus(form, '', 'info');
    }
    return;
  }

  // Single-answer tasks: show only latest, hide form.
  const it = items[0];
  const when = (it && it.createdAt) ? fmtWhen(it.createdAt) : '';
  const notes = (it && it.notes) ? String(it.notes) : '';
  const imgs = (it && Array.isArray(it.images)) ? it.images : [];
  const thumbs = imgs.length
    ? `<div class="thumbs">${imgs.map((u) => `
        <a class="thumb" href="${escapeAttr(u)}" data-lightbox="${escapeAttr(u)}" download>
          <img src="${escapeAttr(u)}" alt="Adjunto" />
        </a>
      `).join('')}</div>`
    : '';
  feed.innerHTML = `
      <div class="item">
        <div class="itemTop">
          <div class="who">${escapeHtml(fixedStudentName)}</div>
          <div class="when">${escapeHtml(when)}</div>
        </div>
        <div class="notes">${escapeHtml(notes)}</div>
        ${thumbs}
      </div>
    `;
  if (form) lockForm(form);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

async function refreshTask(taskId) {
  const t = String(taskId);
  const feed = document.querySelector(`[data-feed="${t}"]`);
  if (feed) feed.dataset.loading = '1';

  try {
    const res = await fetch(`/api/tasks?weekId=${encodeURIComponent(activeWeekId)}&taskId=${encodeURIComponent(t)}&limit=12`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      renderTask(t, []);
      return;
    }
    latestByTask.set(t, data.items);
    renderTask(t, data.items);
  } catch {
    // Keep existing UI if offline.
  } finally {
    if (feed) delete feed.dataset.loading;
  }
}

async function refreshAll() {
  const taskIds = Array.from(document.querySelectorAll('[data-feed]'))
    .map((el) => el.getAttribute('data-feed'))
    .filter(Boolean);

  if (taskIds.length === 0) return;
  await Promise.all(taskIds.map((t) => refreshTask(t)));
}

for (const form of document.querySelectorAll('[data-task-form]')) {
  form.addEventListener('submit', handleSubmit);
}

// Allow inserting tab characters inside the textareas (useful for lists/indentation).
document.addEventListener('keydown', (e) => {
  const target = e.target;
  if (!target || target.tagName !== 'TEXTAREA') return;
  if (e.key !== 'Tab') return;

  e.preventDefault();
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const value = target.value;
  target.value = value.slice(0, start) + '\t' + value.slice(end);
  target.selectionStart = target.selectionEnd = start + 1;
});

// Edit + remove saved images
document.addEventListener('click', (e) => {
  const target = e.target;
  const editBtn = target && target.closest ? target.closest('[data-edit]') : null;
  if (editBtn) {
    const taskId = editBtn.getAttribute('data-edit');
    const form = getForm(taskId);
    const items = latestByTask.get(String(taskId)) || [];
    const it = items[0] || null;
    if (form) {
      unlockForm(form);
      const textarea = form.querySelector('textarea[name="notes"]');
      if (textarea && it && it.notes) textarea.value = String(it.notes);
      const imgs = it && Array.isArray(it.images) ? it.images : [];
      setKeptImages(form, imgs);
      renderSavedImages(form, imgs);
      const fileInput = form.querySelector('input[name="images"]');
      if (fileInput) fileInput.value = '';
      setStatus(form, '', 'info');
    }
    return;
  }

  const rm = target && target.closest ? target.closest('[data-remove-img]') : null;
  if (rm) {
    const url = rm.getAttribute('data-remove-img');
    const form = rm.closest('form');
    if (!form || !url) return;
    const kept = getKeptImages(form).filter((u) => u !== url);
    setKeptImages(form, kept);
    renderSavedImages(form, kept);
  }
});

// Manual refresh buttons removed (auto refresh handles it).

for (const tab of document.querySelectorAll('[data-week-tab]')) {
  tab.addEventListener('click', async () => {
    const weekId = tab.getAttribute('data-week-tab');
    if (!weekId) return;
    activeWeekId = weekId;

    for (const t of document.querySelectorAll('[data-week-tab]')) {
      t.classList.toggle('active', t === tab);
    }
    for (const panel of document.querySelectorAll('[data-week-panel]')) {
      panel.style.display = panel.getAttribute('data-week-panel') === weekId ? '' : 'none';
    }

    await refreshAll();
  });
}

// Initial + auto refresh
refreshAll();
setInterval(refreshAll, 8000);

// Lightbox
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.querySelector('[data-lightbox-img]');
const lightboxDownload = document.querySelector('[data-lightbox-download]');

function openLightbox(src) {
  if (!lightbox || !lightboxImg || !src) return;
  lightboxImg.src = src;
  if (lightboxDownload) lightboxDownload.href = src;
  lightbox.classList.add('show');
  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.classList.remove('show');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImg.src = '';
}

document.addEventListener('click', (e) => {
  const target = e.target;
  const anchor = target && target.closest ? target.closest('[data-lightbox]') : null;
  if (anchor) {
    e.preventDefault();
    openLightbox(anchor.getAttribute('data-lightbox'));
    return;
  }

  if (target && (target.matches?.('[data-lightbox-close]') || target === lightbox)) {
    closeLightbox();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});
