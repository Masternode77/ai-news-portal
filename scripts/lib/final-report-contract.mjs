const REQUIRED_SECTIONS = [
  ['commands_run', /##\s+commands run\b/i],
  ['artifacts', /##\s+artifacts\b/i],
  ['pass_fail', /##\s+pass\/fail\b/i],
  ['remaining_risks', /##\s+remaining risks\b/i],
  ['cleanup_receipts', /##\s+cleanup receipts\b/i],
];

const TODO_MARKER = /\b(?:TODO|TBD|finish later)\b/i;

function sectionBody(text, headingPattern) {
  const match = headingPattern.exec(text);
  if (!match) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/\n##\s+/);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

export function validateFinalReport(text = '') {
  const report = String(text);
  const failures = [];

  if (TODO_MARKER.test(report)) failures.push('contains_todo_marker');
  if (report.trim().length < 300) failures.push('report_too_short');

  for (const [name, pattern] of REQUIRED_SECTIONS) {
    if (!pattern.test(report)) {
      failures.push(`missing_${name}`);
      continue;
    }
    const body = sectionBody(report, pattern);
    if (!body || /^[-*]\s*(?:none|n\/a)\.?$/i.test(body)) failures.push(`empty_${name}`);
  }

  if (!/\b(?:pass|passed|green|ok|failed|blocked|skipped)\b/i.test(report)) {
    failures.push('missing_status_word');
  }

  return { ok: failures.length === 0, failures };
}
