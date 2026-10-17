# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 0 — 진단** (`REBUILD_BRIEF.md` §6) |
| `phase_status` | `done` — 산출물 작성·검증 완료, Josh 승인 대기 |
| `last_pass` | Phase 0 검증 2026-10-17: `git status` 범위 OK (`docs/`, `scripts/diagnose/`, `REBUILD_BRIEF.md`만), funnel 120런, 오프라인 테스트 135/135 pass, 네트워크 0 입증 |
| `baseline_commit` | `e1ee3f245e521929c43c977b8264c6048433d321` (origin/main, 2026-10-17) — Vercel READY 배포 커밋은 커넥터 403으로 미확인 |
| `branch` | `claude/tender-bell-o5si5j` → draft PR → `main` (Phase 0~1 docs). `rebuild/v2` worktree는 Phase 2부터 |
| `pending_approval` | 1) `docs/diagnosis/04-verdict.md` 판정(H1 > H2 > H3) 2) `docs/diagnosis/05-preserve-list.md` 3) Phase 1 착수 |
| `blockers` | 없음 (Phase 0 범위 내). 증거 공백: Mac 잡 레코드 미수령(`docs/diagnosis/mac-jobs/`), Vercel 커넥터 팀 스코프 미인가, Supabase 접근 없음 |
| `production_health` | 생성 파이프라인 **정지 중**: heartbeat 2026-10-11T04:31Z 이후 성공 없음(GitHub 이슈 #29). 원인: 러너 4단계 EIA 복원 실패(#56으로 수정) + Mac 로컬 git 손상(레포 밖). 사이트 서빙은 정상(정적) |
| `next_step` | Josh가 04·05 검토 → 승인 시 Phase 1(ADR-001~007, target/contracts/plan) |
| `updated_at` | 2026-10-17 |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설 |
