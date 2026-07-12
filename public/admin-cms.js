(() => {
  const byId = (id) => document.getElementById(id);
  const text = (value) => String(value ?? '');
  const clear = (element) => {
    if (element) element.replaceChildren();
  };
  const element = (tag, content, attributes = {}) => {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = text(content);
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) node.setAttribute(name, text(value));
    }
    return node;
  };

  function admin() {
    return window.computeCurrentAdmin;
  }

  async function request(url, options = {}) {
    const method = text(options.method || 'GET').toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      headers['X-CSRF-Token'] = admin().csrfToken;
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    return admin().requestJson(url, { ...options, method, headers });
  }

  function fillForm(form, article) {
    for (const control of form.elements) {
      if (!control.name || control.type === 'file') continue;
      const value = article[control.name]
        ?? (control.name === 'bodyMarkdown' ? article.expertLensFull?.finalArticleBody || article.articleText : undefined);
      if (Array.isArray(value)) control.value = value.join(', ');
      else if (value !== undefined && value !== null) {
        if (control.type === 'datetime-local' && value) {
          const parsed = new Date(value);
          control.value = Number.isNaN(parsed.getTime()) ? '' : new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        } else control.value = value;
      }
    }
  }

  function formPayload(form) {
    const payload = {};
    for (const [key, value] of new FormData(form)) {
      if (value instanceof File) continue;
      payload[key] = value;
    }
    return payload;
  }

  function renderArticleRows(articles) {
    const target = byId('admin-article-rows');
    clear(target);
    for (const article of articles) {
      const row = document.createElement('tr');
      const titleCell = document.createElement('td');
      const link = element('a', article.title || article.id, { href: `/admin/articles/${encodeURIComponent(article.id)}/edit` });
      titleCell.append(link, element('small', article.id));
      row.append(
        titleCell,
        element('td', article.deletedAt ? 'deleted' : article.public_status || 'draft'),
        element('td', article.source || '—'),
        element('td', article.updatedAt || '—'),
      );
      target.append(row);
    }
    if (!articles.length) {
      const row = document.createElement('tr');
      const cell = element('td', 'No matching articles.', { colspan: '4' });
      row.append(cell);
      target.append(row);
    }
  }

  async function loadArticles() {
    const form = byId('admin-article-filters');
    const params = new URLSearchParams(window.location.search);
    if (form) {
      form.elements.q.value = params.get('q') || '';
      form.elements.status.value = params.get('status') || '';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const next = new URLSearchParams(formPayload(form));
        for (const [key, value] of [...next]) if (!text(value).trim()) next.delete(key);
        window.history.replaceState({}, '', `${window.location.pathname}${next.size ? `?${next}` : ''}`);
        renderArticleRows((await request(`/api/admin/articles?${next}`)).articles || []);
      });
    }
    renderArticleRows((await request(`/api/admin/articles?${params}`)).articles || []);
  }

  function renderRevisions(revisions) {
    const target = byId('admin-revisions');
    if (!target) return;
    clear(target);
    target.append(element('h2', 'Revision history'));
    const list = document.createElement('ol');
    for (const revision of [...revisions].reverse()) {
      list.append(element('li', `v${revision.version} · ${revision.action} · ${revision.timestamp}`));
    }
    if (!revisions.length) list.append(element('li', 'No revisions yet.'));
    target.append(list);
  }

  function renderPreview(preview) {
    const target = byId('admin-preview');
    if (!target) return;
    clear(target);
    const imageUrl = text(preview?.image);
    if (imageUrl.startsWith('/') || imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
      target.append(element('img', undefined, { src: imageUrl, alt: preview?.title || 'Draft image' }));
    }
    target.append(
      element('h2', preview?.title || 'Untitled draft'),
      element('p', preview?.dek || ''),
      element('p', preview?.body || preview?.text || 'Preview generated without persistence.'),
    );
  }

  async function uploadSelectedImage(form, articleId) {
    const file = form.elements.media?.files?.[0];
    if (!file) return '';
    if (file.size > 3 * 1024 * 1024) throw new Error('Image must be 3 MB or smaller.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(text(reader.result)), { once: true });
      reader.addEventListener('error', () => reject(new Error('Image could not be read.')), { once: true });
      reader.readAsDataURL(file);
    });
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const result = await request('/api/admin/media', {
      method: 'POST',
      body: JSON.stringify({ articleId, name: file.name, contentType: file.type, data, altText: form.elements.imageAlt?.value || '' }),
    });
    return result.media?.url || '';
  }

  async function loadEditor() {
    const form = byId('admin-article-form');
    const id = new URLSearchParams(window.location.search).get('id');
    if (!form || !id) {
      admin().setStatus('Missing article id.', 'error');
      return;
    }
    const loaded = await request(`/api/admin/article?id=${encodeURIComponent(id)}`);
    if (admin().role !== 'admin') {
      for (const control of form.querySelectorAll('[data-admin-only]')) control.remove();
    }
    fillForm(form, loaded.article);
    form.elements.version.value = loaded.article.version;
    renderRevisions(loaded.revisions || []);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const action = event.submitter?.dataset.action || 'save-draft';
      const payload = { ...formPayload(form), id, action, expectedVersion: Number(form.elements.version.value) };
      try {
        if (action === 'permanent-delete') {
          if (admin().role !== 'admin') throw new Error('Administrator role required.');
          payload.confirmation = window.prompt(`Type permanently-delete:${id} to confirm`) || '';
        }
        admin().setStatus(`${action} in progress...`);
        if (action === 'upload-image') {
          const uploadedUrl = await uploadSelectedImage(form, id);
          if (!uploadedUrl && !text(payload.heroImage || payload.replacementImage).trim()) {
            throw new Error('Choose an image file or provide an image URL.');
          }
          if (uploadedUrl) {
            payload.replacementImage = uploadedUrl;
            payload.heroImage = uploadedUrl;
            payload.thumbnailImage = uploadedUrl;
          }
        }
        const result = await request('/api/admin/article', { method: action === 'permanent-delete' ? 'DELETE' : 'PATCH', body: JSON.stringify(payload) });
        if (result.deleted) {
          window.location.assign('/admin/articles/?includeDeleted=true');
          return;
        }
        fillForm(form, result.article);
        form.elements.version.value = result.article.version;
        renderPreview(result.preview);
        const revisions = await request(`/api/admin/revisions?id=${encodeURIComponent(id)}`);
        renderRevisions(revisions.revisions || []);
        admin().setStatus(`${action} complete.`, 'success');
      } catch (error) {
        admin().setStatus(error.message, 'error');
      }
    });

    form.querySelector('[data-action="preview"]')?.addEventListener('click', async () => {
      try {
        const result = await request('/api/admin/article', {
          method: 'PATCH',
          body: JSON.stringify({ ...formPayload(form), id, action: 'preview', expectedVersion: Number(form.elements.version.value) }),
        });
        renderPreview(result.preview);
      } catch (error) {
        admin().setStatus(error.message, 'error');
      }
    });
  }

  async function createArticle() {
    const form = byId('admin-article-form');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const result = await request('/api/admin/articles', { method: 'POST', body: JSON.stringify(formPayload(form)) });
        window.location.assign(`/admin/articles/editor/?id=${encodeURIComponent(result.article.id)}`);
      } catch (error) {
        admin().setStatus(error.message, 'error');
      }
    });
  }

  function renderCounts(counts) {
    const target = byId('admin-dashboard-counts');
    clear(target);
    for (const [label, value] of Object.entries(counts || {})) {
      const tile = document.createElement('div');
      tile.append(element('span', label), element('strong', Number(value || 0).toLocaleString('en-US')));
      target.append(tile);
    }
  }

  async function loadDashboard() {
    const result = await request('/api/admin/dashboard');
    renderCounts(result.dashboard?.counts || {});
  }

  function renderSimpleList(targetId, rows, label) {
    const target = byId(targetId);
    clear(target);
    const list = document.createElement('ul');
    for (const row of rows) list.append(element('li', row[label] || row.title || row.name || row.id || 'Record'));
    if (!rows.length) list.append(element('li', 'No records.'));
    target?.append(list);
  }

  async function loadOperations(view) {
    const mapping = {
      sources: ['admin-source-list', 'name'],
      quarantine: ['admin-quarantine-list', 'title'],
      pipeline: ['admin-pipeline-runs', 'id'],
    };
    const [target, label] = mapping[view];
    const result = await request(`/api/admin/operations?view=${encodeURIComponent(view)}`);
    renderSimpleList(target, result.rows || [], label);
  }

  async function loadAudit() {
    const result = await request('/api/admin/audit');
    renderSimpleList('admin-audit-entries', result.entries || [], 'action');
  }

  let started = false;
  async function start() {
    if (started || !admin()?.user) return;
    started = true;
    const view = document.querySelector('[data-admin-cms]')?.dataset.adminView;
    try {
      if (view === 'dashboard') await loadDashboard();
      else if (view === 'articles') await loadArticles();
      else if (view === 'article-new') await createArticle();
      else if (view === 'article-editor') await loadEditor();
      else if (['sources', 'quarantine', 'pipeline'].includes(view)) await loadOperations(view);
      else if (view === 'audit-log') await loadAudit();
    } catch (error) {
      admin().setStatus(error.message, 'error');
    }
  }

  window.addEventListener('compute-current-admin-ready', start);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
