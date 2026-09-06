function normalizeSelection(value) {
  return String(value ?? '').trim();
}

export function filterCapacityGroups(groups, filters = {}) {
  const year = normalizeSelection(filters.year);
  const state = normalizeSelection(filters.state).toUpperCase();

  return groups.filter((group) => {
    const groupYear = group.year == null ? 'unknown' : String(group.year);
    return (!year || groupYear === year) && (!state || group.state === state);
  });
}

export function summarizeCapacityGroups(groups) {
  const summary = groups.reduce((result, group) => ({
    rows: result.rows + 1,
    units: result.units + group.units,
    netSummerMW: result.netSummerMW + group.netSummerMW,
  }), { rows: 0, units: 0, netSummerMW: 0 });

  return { ...summary, netSummerMW: Math.round(summary.netSummerMW * 10) / 10 };
}
