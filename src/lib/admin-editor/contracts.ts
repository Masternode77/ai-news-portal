export type JsonRecord = Readonly<Record<string, unknown>>;

export type AdminArticleResponse = Readonly<{
  article: JsonRecord;
  publicDetail: Readonly<{ eligible: boolean; href: string }>;
  sourceFile: string;
  sourceSha: string;
  commitUrl: string;
}>;

export type AdminSessionResponse = Readonly<{ csrfToken: string }>;

export const isJsonRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

export const stringValue = (record: JsonRecord, key: string): string => {
  const value = record[key];
  return typeof value === 'string' ? value : '';
};

export const stringList = (record: JsonRecord, key: string): readonly string[] => {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
};

const requiredString = (record: JsonRecord, key: string, message: string): string => {
  const value = stringValue(record, key);
  if (!value) throw new Error(message);
  return value;
};

const publicDetail = (value: unknown): AdminArticleResponse['publicDetail'] => {
  if (!isJsonRecord(value)) return { eligible: false, href: '' };
  return { eligible: value['eligible'] === true, href: stringValue(value, 'href') };
};

export const parseArticleResponse = (value: unknown): AdminArticleResponse => {
  if (!isJsonRecord(value) || !isJsonRecord(value['article'])) throw new Error('Invalid article response.');
  return {
    article: value['article'],
    publicDetail: publicDetail(value['publicDetail']),
    sourceFile: requiredString(value, 'sourceFile', 'Invalid article response.'),
    sourceSha: requiredString(value, 'sourceSha', 'Invalid article response.'),
    commitUrl: stringValue(value, 'commitUrl'),
  };
};

export const parseSessionResponse = (value: unknown): AdminSessionResponse => {
  if (!isJsonRecord(value)) throw new Error('Invalid session response.');
  return { csrfToken: requiredString(value, 'csrfToken', 'Invalid session response.') };
};
