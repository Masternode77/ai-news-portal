function element(document, id) {
  return document.getElementById(id);
}

function clearElements(document, ids) {
  for (const id of ids) element(document, id)?.replaceChildren();
}

export function clearDashboardPrivateDom(document) {
  element(document, 'article-filter-form')?.reset();
  clearElements(document, [
    'count-tiles',
    'review-queues',
    'article-table-body',
    'admin-logs',
    'status-filter',
    'category-filter',
    'source-filter',
  ]);
}

export function clearEditorPrivateDom(document) {
  element(document, 'article-form')?.reset();
  clearElements(document, ['article-meta', 'admin-preview', 'editor-title']);
  element(document, 'article-context-link')?.setAttribute('href', '/admin/dashboard/');
}
