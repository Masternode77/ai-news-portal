function stable(value) {
  return JSON.stringify(value ?? null);
}

function text(value) {
  return String(value ?? '').trim();
}

export function summarizeAdminAuditChange({ before = {}, after = {}, actor = 'admin', action = 'save-draft', articleId = '', timestamp = new Date().toISOString(), commitSha = '' } = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changedFields = keys.filter((key) => stable(before[key]) !== stable(after[key]));
  const beforeStatus = text(before.public_status || 'unset');
  const afterStatus = text(after.public_status || 'unset');
  const statusChange = before.public_status !== after.public_status ? ' status ' + beforeStatus + ' -> ' + afterStatus : '';
  const id = text(articleId || after.id || before.id);
  return {
    articleId: id,
    actor: text(actor || 'admin'),
    action: text(action || 'save-draft'),
    timestamp,
    commitSha: text(commitSha),
    changedFields,
    before: Object.fromEntries(changedFields.map((field) => [field, before[field]])),
    after: Object.fromEntries(changedFields.map((field) => [field, after[field]])),
    summary: text(action || 'save-draft') + ' ' + id + ':' + (statusChange || ' fields updated') + ' (' + (changedFields.join(', ') || 'no changes') + ')',
  };
}

export function appendAdminAuditEntry(log = [], entry = {}) {
  return [...(Array.isArray(log) ? log : []), entry];
}
