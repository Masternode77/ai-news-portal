# STATUS — computecurrent.com 리빌드 (단일 진실)

| 필드 | 값 |
|---|---|
| `phase` | **Phase 1 — 목표 아키텍처 설계 + 마이그레이션 계획** (`REBUILD_BRIEF.md` §6) |
| `phase_status` | `done` — ADR-001~008, `docs/architecture/{target,contracts}.md`, `docs/migration/plan.md` 작성·검증 완료, Josh 승인 대기 |
| `last_pass` | Phase 0 승인 2026-10-18 (Josh). Phase 1 검증 2026-10-18: `git status` docs/만, ADR 8개 섹션 구조 OK, R1~R8 추적표 OK, 링크·경로 검사 OK |
| `baseline_commit` | `e1ee3f245e521929c43c977b8264c6048433d321` (origin/main) — Vercel READY 배포 커밋은 커넥터 403으로 미확인 |
| `branch` | `claude/tender-bell-o5si5j` → draft PR #57 (Phase 0 + Phase 1 docs). `rebuild/v2` worktree는 Phase 2부터 |
| `decisions` | 2026-10-18 Josh: 런타임 = GitHub Actions + API 키(ADR-002), 저장소·발행 = Supabase + Astro SSR/ISR(ADR-003/005), 링크 전용 매체 재서술 허용(ADR-004). 가정값: 브리프 1~2/사이클, 에세이 1/일, 비용 상한 USD 2/런 |
| `pending_approval` | 1) ADR-001~007 승인(수정 요청 가능) 2) 선택 ADR-008 의견 3) Phase 2 착수 |
| `blockers` | 없음(설계 범위). 미수령 입력: Anthropic API 키, Supabase 키·프로젝트 선택, Telegram, 보이스 샘플, 재서술 금지 매체 목록, Vercel 재인가 (`docs/migration/plan.md` §4) |
| `production_health` | 생성 파이프라인 **정지 중**(heartbeat 2026-10-11T04:31Z, 이슈 #29). 사이트 서빙 정상(정적) |
| `next_step` | Josh가 ADR 검토 → 승인 시 Phase 2(뼈대·계약·테스트 하네스·CI, `rebuild/v2` worktree). 킥오프 문구: 브리프 Appendix D Phase 2 |
| `updated_at` | 2026-10-18 |

## 세션 로그

| 날짜 | Phase | 상태 | 요약 |
|---|---|---|---|
| 2026-10-17 | 0 | done | 브리프 저장, 인벤토리·파이프라인 지도·funnel(120런, git 118커밋 측정)·에러 분류·판정·보존 목록·CLAUDE.md 초안, `scripts/diagnose/{funnel,urls}.mjs` 신설. PR #57 |
| 2026-10-18 | 0→1 | approved | Josh가 04-verdict·05-preserve-list 승인, 런타임·저장소·재서술 결정 |
| 2026-10-18 | 1 | done | ADR-001~008, target.md, contracts.md, migration/plan.md(추적표 포함). 코드 변경 0 |
