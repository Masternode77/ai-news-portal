export function normalizeDemand(payload, { retrievedAt = new Date().toISOString() } = {}) {
  const retrievedMs = Date.parse(retrievedAt);
  if (!Number.isFinite(retrievedMs)) throw new Error('Invalid retrieval date');
  const source = payload?.response?.data;
  if (!Array.isArray(source) || !source.length) throw new Error('EIA demand response has no observations');
  const seen = new Set();
  const records = source.map((row) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(row.period) || row.type !== 'D' || row['value-units'] !== 'megawatthours' || !['ERCO', 'PJM', 'AZPS'].includes(row.respondent)) throw new Error('Unexpected EIA demand dimensions');
    if (!['number', 'string'].includes(typeof row.value)) throw new Error('Invalid demand value type');
    const value = Number(row.value);
    if (row.value === null || String(row.value).trim() === '' || !Number.isFinite(value) || value < 0 || !Number.isFinite(Date.parse(`${row.period}:00:00Z`))) throw new Error('Invalid demand observation');
    if (new Date(`${row.period}:00:00Z`).toISOString().slice(0,13) !== row.period) throw new Error('Invalid demand calendar date');
    if (Date.parse(`${row.period}:00:00Z`) > retrievedMs) throw new Error('Invalid future demand observation');
    const id = `${row.respondent}:${row.period}`;
    if (seen.has(id)) throw new Error('Duplicate demand observation');
    seen.add(id);
    return { period: `${row.period}:00:00Z`, respondent: row.respondent, value };
  }).sort((a,b) => a.period.localeCompare(b.period) || a.respondent.localeCompare(b.respondent));
  return { dataset: 'EIA-930 hourly balancing-authority demand', sourceUrl: 'https://www.eia.gov/electricity/gridmonitor/', retrievedAt, asOf: records.at(-1).period, unit: 'MWh', records };
}
export function snapshotAge(asOf, now = new Date()) {
  const time = Date.parse(asOf.length === 7 ? `${asOf}-01T00:00:00Z` : asOf);
  if (!Number.isFinite(time) || time > Number(now)) return { days: null, label: 'Date unavailable' };
  const days = Math.floor((Number(now) - time) / 86400000);
  return { days, label: days > 60 ? 'Historical snapshot' : days > 2 ? 'Dated snapshot' : 'Recent snapshot' };
}
export function csv(rows) {
  const cell = (v) => { const s = String(v ?? ''); return `"${(/^[=+@\-\t\r]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"`; };
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function capacityGroups(records) {
  const groups = new Map();
  for (const row of records) {
    const key = `${row.year ?? 'Unknown'}|${row.state}`;
    const group = groups.get(key) || { year: row.year, state: row.state, units: 0, netSummerMW: 0, missing: 0 };
    group.units++;
    if (row.netSummerMW == null) group.missing++; else group.netSummerMW += row.netSummerMW;
    groups.set(key, group);
  }
  return [...groups.values()].map(r => ({ ...r, netSummerMW: Math.round(r.netSummerMW * 10) / 10 })).sort((a,b) => (a.year ?? 9999) - (b.year ?? 9999) || a.state.localeCompare(b.state));
}
