// Identity markers for authored columns. This module has no imports so that
// leaf utilities (the reader-copy guard among them) can tell a column from a
// news record without pulling in the column policy, which itself depends on
// those utilities.
export const AUTHORED_GENERATION_VERSION = 'authored_column_v1';
export const AUTHORED_COLUMN_TIER = 'authored_column';

export function isAuthoredColumn(record = {}) {
  return record?.content_origin === 'authored'
    || record?.generation_version === AUTHORED_GENERATION_VERSION
    || record?.public_content_tier === AUTHORED_COLUMN_TIER;
}
