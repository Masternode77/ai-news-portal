export function seniorEditorRewrite(body = '') {
  return String(body || '')
    .replace(/\bshould care because\b/gi, 'should watch')
    .replace(/\bsource-backed change\b/gi, 'reported change')
    .replace(/\bturns the reported move into\b/gi, 'makes the reported move')
    .replace(/\bthe practical issue is whether\b/gi, 'the operating question is whether')
    .replace(/\bthe next signal to watch is\b/gi, 'watch')
    .replace(/\bthe watch metric is\b/gi, 'watch')
    .replace(/\bfor Compute Current readers\b/gi, 'for infrastructure readers')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
