import { isJsonRecord, stringValue } from './contracts';

export class AdminRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = Readonly<{ method?: string; body?: string }>;

const responsePayload = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) return {};
    throw error;
  }
};

export const requestAdminJson = async (url: string, options: RequestOptions, csrfToken: string): Promise<unknown> => {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers['X-CSRF-Token'] = csrfToken;
  const response = await fetch(url, { ...options, headers });
  const payload = await responsePayload(response);
  if (!response.ok) {
    const message = isJsonRecord(payload) ? stringValue(payload, 'error') : '';
    throw new AdminRequestError(response.status, message || 'Request failed.');
  }
  return payload;
};
