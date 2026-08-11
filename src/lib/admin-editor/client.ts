import { clearEditorPrivateDom } from '../admin-private-state.mjs';
import { AdminRequestError, requestAdminJson } from './api';
import { parseArticleResponse, parseSessionResponse } from './contracts';
import { articleSubmission, editorDom, fillEditor, loginCredentials, renderPreview, setStatus } from './dom';

type EditorState = { articleId: string; csrfToken: string; sourceSha: string };

const actionSuccessMessage = (action: string): string => {
  switch (action) {
    case 'save-draft': return 'Draft saved in GitHub.';
    case 'publish': return 'Published state saved in GitHub.';
    case 'hide': return 'Hidden state saved in GitHub.';
    case 'noindex': return 'Noindex state saved in GitHub.';
    case 'upload-image': return 'Replacement image saved in GitHub.';
    default: return 'Article update saved in GitHub.';
  }
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Request failed.';

export const startAdminEditor = (document: Document): void => {
  const state: EditorState = { articleId: new URLSearchParams(window.location.search).get('id')?.trim() || '', csrfToken: '', sourceSha: '' };
  const dom = editorDom(document);
  const clearPrivateState = (): void => {
    state.csrfToken = '';
    state.sourceSha = '';
    state.articleId = '';
    clearEditorPrivateDom(document);
    if (dom.contextLink) dom.contextLink.textContent = 'Back to dashboard';
    window.history.replaceState({}, '', '/admin/edit/');
  };
  const showLogin = (message = 'Sign in to edit this article.'): void => {
    clearPrivateState();
    if (dom.loginPanel) dom.loginPanel.hidden = false;
    if (dom.editorPanel) dom.editorPanel.hidden = true;
    setStatus(dom.status, message);
  };
  const request = async (url: string, options: Readonly<{ method?: string; body?: string }> = {}): Promise<unknown> => {
    try {
      return await requestAdminJson(url, options, state.csrfToken);
    } catch (error) {
      if (error instanceof AdminRequestError) {
        if (error.status === 401 || error.status === 403) showLogin('Your session is no longer available. Sign in again.');
        throw error;
      }
      throw error;
    }
  };
  const showEditor = async (): Promise<void> => {
    setStatus(dom.status, 'Loading article...');
    const response = parseArticleResponse(await request(`/api/admin/article?id=${encodeURIComponent(state.articleId)}`));
    state.sourceSha = response.sourceSha;
    fillEditor(dom, response);
    if (dom.loginPanel) dom.loginPanel.hidden = true;
    if (dom.editorPanel) dom.editorPanel.hidden = false;
    setStatus(dom.status, `Loaded from ${response.sourceFile}.`, 'success');
  };
  const checkSession = async (): Promise<void> => {
    if (!state.articleId) {
      if (dom.loginPanel) dom.loginPanel.hidden = true;
      if (dom.editorPanel) dom.editorPanel.hidden = true;
      setStatus(dom.status, 'Choose an article from the admin dashboard.', 'error');
      return;
    }
    try {
      state.csrfToken = parseSessionResponse(await request('/api/admin/login')).csrfToken;
      await showEditor();
    } catch (error) {
      if (error instanceof Error) {
        showLogin();
        return;
      }
      throw error;
    }
  };
  dom.loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStatus(dom.status, 'Signing in...');
      state.csrfToken = parseSessionResponse(await request('/api/admin/login', { method: 'POST', body: JSON.stringify(loginCredentials(dom.loginForm)) })).csrfToken;
      if (!state.articleId) window.location.assign('/admin/dashboard/');
      else await showEditor();
    } catch (error) {
      setStatus(dom.status, errorMessage(error), 'error');
    }
  });
  dom.articleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = dom.actionInput?.value || 'save-draft';
    try {
      setStatus(dom.status, `Running ${action}...`);
      const response = parseArticleResponse(await request('/api/admin/article', { method: 'POST', body: JSON.stringify(articleSubmission(dom.articleForm, state.articleId, action, state.sourceSha)) }));
      state.sourceSha = response.sourceSha || state.sourceSha;
      fillEditor(dom, response);
      const commit = response.commitUrl ? ` Commit: ${response.commitUrl}` : '';
      setStatus(dom.status, `${actionSuccessMessage(action)}${commit}`, 'success');
    } catch (error) {
      setStatus(dom.status, errorMessage(error), 'error');
    }
  });
  dom.articleForm?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('[data-action]');
    if (!(button instanceof HTMLButtonElement)) return;
    const action = button.dataset['action'] || 'save-draft';
    if (dom.actionInput) dom.actionInput.value = action;
    if (action === 'preview') {
      event.preventDefault();
      renderPreview(dom.articleForm, dom.preview);
      setStatus(dom.status, 'Preview updated.', 'success');
    }
  });
  dom.articleForm?.addEventListener('input', () => renderPreview(dom.articleForm, dom.preview));
  dom.logoutButton?.addEventListener('click', async () => {
    try {
      await request('/api/admin/login', { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof Error)) throw error;
    }
    showLogin('Signed out.');
  });
  void checkSession();
};
