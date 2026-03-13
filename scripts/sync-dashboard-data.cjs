#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(ROOT, '..');
const PUBLIC_DATA_PATH = path.join(ROOT, 'public', 'dashboard-data.json');
const FALLBACK_DATA_PATH = path.join(ROOT, 'src', 'pages', 'dashboard-fallback.json');

const snapshotPathCandidates = [
  // CI/로컬에서 우선순위: 패키지 내 스냅샷
  path.join(ROOT, 'src', 'data', 'cron-registry-snapshot-latest.json'),
  // 기존 운영 환경 경로(작업 디렉터리 기준)
  process.env.CRON_SNAPSHOT_PATH,
  '/Users/josh/.openclaw/workspace/PROJECTS/openclaw-rebuild/mission-control-v1/cron-registry-snapshot-latest.json',
  '/Users/josh/.openclaw/workspace/PROJECTS/openclaw-rebuild/mission-control-v1/cron-registry-snapshot-2026-02-13.json',
  '/Users/josh/.openclaw/workspace/PROJECTS/openclaw-rebuild/mission-control-v1/cron-registry-snapshot-2026-02-13-post-day3.json',
  path.join(ROOT, 'dist', 'cron-registry-snapshot.json'),
].filter(Boolean);

const dashboardBoardCandidates = [
  path.join(WORKSPACE_ROOT, 'TASK_BOARD.kanban.md'),
  path.join(WORKSPACE_ROOT, 'TASK_BOARD.md'),
  '/Users/josh/.openclaw/workspace/TASK_BOARD.kanban.md',
  '/Users/josh/.openclaw/workspace/TASK_BOARD.md',
];

function toKstTime(ms) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeState(state) {
  if (!state) {
    return { lastStatus: 'unknown', nextRunAtMs: null, lastRunAtMs: null, consecutiveErrors: 0, lastDurationMs: 0 };
  }
  return {
    lastStatus: state.lastStatus || 'unknown',
    nextRunAtMs: Number.isFinite(state.nextRunAtMs) ? state.nextRunAtMs : null,
    lastRunAtMs: Number.isFinite(state.lastRunAtMs) ? state.lastRunAtMs : null,
    consecutiveErrors: Number.isFinite(state.consecutiveErrors) ? state.consecutiveErrors : 0,
    lastDurationMs: Number.isFinite(state.lastDurationMs) ? state.lastDurationMs : 0,
  };
}

function topPriorityFromTitle(name) {
  if (/\bP1\b/.test(name)) return 'P1';
  if (/\bP2\b/.test(name)) return 'P2';
  return 'P3';
}

function parseBoardTopActions() {
  const content = dashboardBoardCandidates.map(safeReadText).find((txt) => txt.length > 0);
  if (!content) return [];

  const sectionMask = content.split(/\n##\s+/);
  const candidateSections = sectionMask.filter(
    (section) => section.startsWith('NEXT') || section.startsWith('SCHEDULED') || section.startsWith('INBOX')
  );
  if (candidateSections.length === 0) return [];

  const lines = candidateSections.join('\n## ').split('\n');
  const parsed = [];

  for (const line of lines) {
    const m = line.match(/^\-\s*\[.\]\s*\*\*\[(P\d)\|(\d+[a-z])\]\*\*\s*([^\-–—]+?)\s*(?:-|–|—|:)?\s*(.*)$/i);
    if (m) {
      const [, p, eta, title, desc] = m;
      parsed.push({
        title: `${title.trim()}${desc ? ` — ${desc.trim().replace(/\s+/g, ' ')}` : ''}`,
        priority: p.toUpperCase(),
        etaMin: parseInt(eta, 10) || 30,
      });
    }
  }

  return parsed
    .slice(0, 3)
    .map((t, i) => ({
      title: t.title,
      priority: t.priority,
      etaMin: t.etaMin,
      status: i === 0 ? '진행중' : '대기',
      progress: Math.min(90, 30 + i * 20),
      nextAt: 'Pending',
    }));
}

function parseJobs(snapshot) {
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];

  const active = jobs.filter((j) => j.enabled !== false);
  const total = jobs.length;
  const activeCount = active.length;

  const statuses = active.map((job) => normalizeState(job.state).lastStatus);
  const completed = statuses.filter((status) => status === 'ok').length;
  const successRate = statuses.length ? Number(((completed / statuses.length) * 100).toFixed(1)) : 100;

  const maxConsecutiveErrors = jobs.reduce((acc, job) => {
    const c = normalizeState(job.state).consecutiveErrors;
    return Math.max(acc, c || 0);
  }, 0);

  const now = Date.now();

  const jobsWithNext = jobs
    .map((job) => ({ ...job, _state: normalizeState(job.state) }))
    .filter((job) => job._state.nextRunAtMs)
    .sort((a, b) => a._state.nextRunAtMs - b._state.nextRunAtMs);

  const timeline = jobsWithNext.slice(0, 8).map((job) => {
    const next = job._state.nextRunAtMs;
    const state = job._state;
    const eta = next > now ? '예정' : '완료 예정';
    return {
      time: next ? toKstTime(next).slice(0, 5) : '-',
      level: topPriorityFromTitle(job.name).replace('P', 'p') || 'p3',
      name: `${job.id ? job.id.slice(0, 7) : 'job'} · ${job.name}`,
      eta,
    };
  });

  const alerts = [];

  jobsWithNext.forEach((job) => {
    const state = job._state;
    const ageMin = Math.max(0, Math.round((now - (state.lastRunAtMs || now)) / 60000));

    if (state.lastStatus === 'error' || state.lastStatus === 'failed') {
      alerts.push({
        level: 'critical',
        text: `${job.name} 실행 실패(최근 상태: ${state.lastStatus})`,
        age: `${ageMin}m ago`,
      });
      return;
    }

    if (state.nextRunAtMs && state.nextRunAtMs > now && state.nextRunAtMs - now <= 3 * 60 * 60 * 1000) {
      alerts.push({
        level: 'warn',
        text: `${job.name} 임박 실행 (${toKstTime(state.nextRunAtMs)} KST)`,
        age: 'approaching',
      });
    }
  });

  if (alerts.length === 0) {
    alerts.push({
      level: 'ok',
      text: '최근 3시간 내 임박/실패 알림 없음',
      age: '현재',
    });
  }

  const boardActions = parseBoardTopActions();
  const topGun = boardActions.length
    ? boardActions
    : jobs.slice(0, 3).map((job, idx) => ({
        title: job.name,
        priority: topPriorityFromTitle(job.name),
        etaMin: 30,
        status: idx === 0 ? '진행중' : '대기',
        progress: Math.min(100, 35 + idx * 20),
        nextAt: job.state?.nextRunAtMs ? `${toKstTime(job.state.nextRunAtMs)} KST` : '-',
      }));

  return {
    generatedAt: new Date().toISOString(),
    kpi: {
      totalJobs: total,
      activeJobs: activeCount,
      successRate24h: successRate,
      errorStreak: maxConsecutiveErrors,
    },
    topGun,
    queue: {
      waiting: jobs.filter((job) => job.enabled === false).length,
      running: active.filter((job) => {
        const s = normalizeState(job.state).lastStatus;
        return s !== 'ok' && s !== 'unknown';
      }).length,
      done: Math.max(0, activeCount - jobs.filter((job) => normalizeState(job.state).lastStatus === 'ok').length),
      items: jobsWithNext.slice(0, 8),
    },
    alerts,
    timeline,
    progress: {
      burnIn: Math.min(100, Math.round((completed / Math.max(1, statuses.length)) * 100)),
      target: 95,
      successRatio: successRate,
      targetRatio: 95,
    },
  };
}

function buildFallback() {
  return safeReadJson(FALLBACK_DATA_PATH) || {
    generatedAt: new Date().toISOString(),
    kpi: {
      totalJobs: 8,
      activeJobs: 8,
      successRate24h: 99.2,
      errorStreak: 0,
    },
    topGun: [
      { title: 'Google 1-pager 완성', priority: 'P1', etaMin: 60, status: '진행중', progress: 74, nextAt: '11:30' },
      { title: 'Daily Top3 Template 표준화', priority: 'P1', etaMin: 45, status: '대기', progress: 35, nextAt: '08:30' },
      { title: 'Nightly Routine 점검', priority: 'P1', etaMin: 15, status: '대기', progress: 0, nextAt: '01:10' },
    ],
    queue: { waiting: 3, running: 1, done: 4, items: [] },
    alerts: [
      { level: 'critical', text: '08:00 리마인더 18분 전 임박', age: '18m ago' },
      { level: 'ok', text: '09:10 Morning Brief 실행 성공', age: '8m ago' },
      { level: 'warn', text: 'Vercel alias 인증 페이지 응답 감지', age: '6m ago' },
    ],
    timeline: [
      { time: '02:00', level: 'p2', name: 'c9e7002e · Nightly Routine', eta: '완료 예정' },
      { time: '08:00', level: 'p1', name: '62b99c8f · OpenClaw 리빌드 리마인더', eta: '실행' },
      { time: '08:30', level: 'p1', name: 'e2e8b81f · Daily Top3 Brief', eta: '예정' },
      { time: '09:10', level: 'p1', name: 'e7d5c6e4 · Morning Intelligence', eta: '예정' },
      { time: '09:20', level: 'p2', name: '605b26e9 · 일일 비용 리포트', eta: '예정' },
      { time: '10:00', level: 'p2', name: '41046689 · BTC 주말 후속 점검', eta: '예정' },
    ],
    progress: { burnIn: 87, target: 95, successRatio: 99.2, targetRatio: 95 },
  };
}

const snapshot = snapshotPathCandidates.map((p) => safeReadJson(p)).find(Boolean);
const payload = snapshot ? parseJobs(snapshot) : buildFallback();

fs.mkdirSync(path.dirname(PUBLIC_DATA_PATH), { recursive: true });
fs.writeFileSync(PUBLIC_DATA_PATH, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Wrote dashboard runtime data to ${PUBLIC_DATA_PATH}`);
