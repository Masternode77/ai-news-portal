const JSON_SCRIPT_ESCAPES = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

export function serializeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => JSON_SCRIPT_ESCAPES[character]);
}
