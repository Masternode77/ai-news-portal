const SAFE_REVISION = /^(?!.*(?:\.\.|@\{|[~^:?*[\]\\]))[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

export function assertSafeRevision(revision = '') {
  if (!SAFE_REVISION.test(revision)) {
    throw new Error(`unsafe revision: ${revision || '(empty)'}`);
  }
  return revision;
}
