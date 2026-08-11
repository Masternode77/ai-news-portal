import type { AdminArticleResponse, JsonRecord } from './contracts';
import { stringList, stringValue } from './contracts';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type SubmissionValue = string | readonly string[];
const directArticleFields: readonly string[] = ['category', 'region', 'source', 'sourceUrl', 'publishedAt', 'metaDescription', 'canonicalUrl', 'sourceImage', 'generatedImage', 'heroImage', 'thumbnailImage', 'imageAlt', 'imagePrompt'];

export type EditorDom = Readonly<{
  loginPanel: HTMLElement | null;
  editorPanel: HTMLElement | null;
  loginForm: HTMLFormElement | null;
  articleForm: HTMLFormElement | null;
  status: HTMLElement | null;
  meta: HTMLElement | null;
  editorTitle: HTMLElement | null;
  logoutButton: HTMLButtonElement | null;
  actionInput: HTMLInputElement | null;
  preview: HTMLElement | null;
  contextLink: HTMLAnchorElement | null;
}>;

const formElement = (document: Document, id: string): HTMLFormElement | null => {
  const element = document.getElementById(id);
  return element instanceof HTMLFormElement ? element : null;
};

const buttonElement = (document: Document, id: string): HTMLButtonElement | null => {
  const element = document.getElementById(id);
  return element instanceof HTMLButtonElement ? element : null;
};

const inputElement = (document: Document, id: string): HTMLInputElement | null => {
  const element = document.getElementById(id);
  return element instanceof HTMLInputElement ? element : null;
};

const anchorElement = (document: Document, id: string): HTMLAnchorElement | null => {
  const element = document.getElementById(id);
  return element instanceof HTMLAnchorElement ? element : null;
};

const formControl = (form: HTMLFormElement | null, name: string): FormControl | null => {
  const control = form?.elements.namedItem(name);
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement ? control : null;
};

const articleValue = (article: JsonRecord, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = stringValue(article, key);
    if (value) return value;
  }
  return '';
};

const containsHangul = (value: string): boolean => /\p{Script=Hangul}/u.test(value);
const languageAttribute = (value: string): string => containsHangul(value) ? ' lang="ko"' : '';
const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

export const sitePreviewImagePath = (value: string): string => {
  const permittedPrefix = ['/generated/', '/uploads/'].find((prefix) => value.startsWith(prefix));
  if (!permittedPrefix || value.length === permittedPrefix.length) return '';
  if (value !== value.trim() || value.includes('//') || value.includes('\\') || value.includes('%') || value.includes('?') || value.includes('#')) return '';
  if (/[\u0000-\u001F\u007F\s<>"']/.test(value)) return '';
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) return '';
  return value;
};

export const editorDom = (document: Document): EditorDom => ({
  loginPanel: document.getElementById('admin-login'),
  editorPanel: document.getElementById('admin-editor'),
  loginForm: formElement(document, 'login-form'),
  articleForm: formElement(document, 'article-form'),
  status: document.getElementById('admin-status'),
  meta: document.getElementById('article-meta'),
  editorTitle: document.getElementById('editor-title'),
  logoutButton: buttonElement(document, 'logout-button'),
  actionInput: inputElement(document, 'editor-action'),
  preview: document.getElementById('admin-preview'),
  contextLink: anchorElement(document, 'article-context-link'),
});

export const setStatus = (status: HTMLElement | null, message: string, type = ''): void => {
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
};

export const setField = (form: HTMLFormElement | null, name: string, value: string): void => {
  const control = formControl(form, name);
  if (control) control.value = value;
};

export const getField = (form: HTMLFormElement | null, name: string): string => formControl(form, name)?.value || '';

export const renderPreview = (form: HTMLFormElement | null, preview: HTMLElement | null): void => {
  if (!form || !preview) return;
  const titleValue = getField(form, 'title');
  const dekValue = getField(form, 'dek');
  const bodyValue = getField(form, 'bodyMarkdown');
  const body = escapeHtml(bodyValue).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  const image = ['replacementImage', 'heroImage', 'generatedImage', 'sourceImage']
    .map((name) => sitePreviewImagePath(getField(form, name)))
    .find(Boolean) || '';
  const imageHtml = image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(getField(form, 'imageAlt') || titleValue)}" loading="lazy">` : '';
  preview.innerHTML = `<article class="admin-preview-article">${imageHtml}<h3${languageAttribute(titleValue)}>${escapeHtml(titleValue) || 'Untitled draft'}</h3><p${languageAttribute(dekValue)}>${escapeHtml(dekValue)}</p><p${languageAttribute(bodyValue)}>${body}</p></article>`;
};

export const fillEditor = (dom: EditorDom, response: AdminArticleResponse): void => {
  const { article, publicDetail } = response;
  const form = dom.articleForm;
  setField(form, 'title', articleValue(article, ['title']));
  setField(form, 'dek', articleValue(article, ['dek', 'deck', 'summary']));
  setField(form, 'expertLensShort', articleValue(article, ['expertLensShort']));
  setField(form, 'bodyMarkdown', articleValue(article, ['bodyMarkdown', 'finalArticleBody']));
  for (const name of directArticleFields) {
    setField(form, name, articleValue(article, [name]));
  }
  setField(form, 'public_status', articleValue(article, ['public_status', 'status']) || 'draft');
  setField(form, 'tags', stringList(article, 'tags').join(', '));
  setField(form, 'replacementImage', '');
  const title = articleValue(article, ['title', 'id']);
  if (dom.editorTitle) {
    dom.editorTitle.textContent = title;
    dom.editorTitle.toggleAttribute('lang', containsHangul(title));
    if (containsHangul(title)) dom.editorTitle.lang = 'ko';
  }
  if (dom.contextLink) {
    dom.contextLink.href = publicDetail.eligible && publicDetail.href ? publicDetail.href : '/admin/dashboard/';
    dom.contextLink.textContent = publicDetail.eligible && publicDetail.href ? 'View public article' : 'Back to dashboard';
  }
  if (dom.meta) {
    const publishedAt = articleValue(article, ['publishedAt']);
    const published = publishedAt ? new Date(publishedAt).toLocaleString('en-US') : 'Unknown date';
    dom.meta.textContent = `${articleValue(article, ['source']) || 'Unknown source'} · ${published} · ${articleValue(article, ['public_status', 'status']) || 'draft'}`;
  }
  renderPreview(form, dom.preview);
};

export const loginCredentials = (form: HTMLFormElement): Readonly<{ username: string; password: string }> => ({
  username: getField(form, 'username'),
  password: getField(form, 'password'),
});

export const articleSubmission = (form: HTMLFormElement, id: string, action: string, sourceSha: string): Readonly<Record<string, SubmissionValue>> => {
  const data: Record<string, SubmissionValue> = {};
  for (const [name, value] of new FormData(form)) if (typeof value === 'string') data[name] = value;
  const tags = typeof data['tags'] === 'string' ? data['tags'].split(',').map((tag) => tag.trim()).filter(Boolean) : [];
  return { ...data, id, action, expectedSourceSha: sourceSha, tags };
};
