function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function firstDate(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (!candidate) continue;
    const time = Date.parse(candidate);
    if (Number.isFinite(time)) return new Date(time).toISOString();
  }
  return '';
}

function timestamp(value) {
  const time = Date.parse(text(value));
  return Number.isFinite(time) ? time : 0;
}

function imageLog(rows = []) {
  return rows
    .filter((row) => row.imageProvider || row.imageError)
    .sort((a, b) => timestamp(b.generatedAt || b.publishedAt) - timestamp(a.generatedAt || a.publishedAt) || a.id.localeCompare(b.id))
    .slice(0, 20)
    .map((row) => ({
      articleId: row.id,
      title: row.title,
      provider: row.imageProvider || 'error',
      generatedAt: row.generatedAt,
      error: row.imageError,
    }));
}

function generationLog(cycles = []) {
  return cycles
    .map((cycle) => ({
      id: text(cycle.cycle_id),
      status: text(cycle.status),
      startedAt: firstDate(cycle.cycle_started_at, cycle.startedAt),
      completedAt: firstDate(cycle.cycle_completed_at, cycle.completedAt),
      scanned: Number(cycle.source_items_scanned || 0),
      selected: (cycle.selected_for_analysis || []).length,
      held: (cycle.held_signals || []).length,
      rejected: (cycle.rejected_signals || []).length,
      published: (cycle.published_analyses || []).length,
    }))
    .sort((a, b) => timestamp(b.startedAt) - timestamp(a.startedAt))
    .slice(0, 20);
}

function publishLog(cycles = []) {
  return cycles
    .filter((cycle) => (cycle.published_analyses || []).length > 0)
    .map((cycle) => ({
      cycleId: text(cycle.cycle_id),
      completedAt: firstDate(cycle.cycle_completed_at, cycle.completedAt, cycle.cycle_started_at),
      articleIds: (cycle.published_analyses || []).map(text).filter(Boolean),
    }))
    .sort((a, b) => timestamp(b.completedAt) - timestamp(a.completedAt))
    .slice(0, 20);
}

export function buildAdminDashboardLogs({ rows = [], editorialCycles = [], claimLedger = [], sourceHealth = [] } = {}) {
  return {
    generation: generationLog(editorialCycles),
    publish: publishLog(editorialCycles),
    image: imageLog(rows),
    audit: {
      unsupportedClaims: claimLedger.filter((claim) => claim.verification_status === 'unsupported').length,
      sourceHealth: sourceHealth.length,
      staleSources: sourceHealth.filter((source) => source.stale === true || lower(source.status) === 'stale').length,
      cycles: editorialCycles.length,
    },
  };
}
