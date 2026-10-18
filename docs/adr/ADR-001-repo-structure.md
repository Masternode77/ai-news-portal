# ADR-001 — 레포 구조

- 상태: Proposed
- 날짜: 2026-10-18
- 관련: ADR-006(마이그레이션), 브리프 P8·P9·R5·R7, §5.7(worktree `rebuild/v2`)

## Context

- 단일 패키지(`compute-current` 0.0.52, npm, Node 22). 사이트(`src/`), 파이프라인(`scripts/` 84 + `scripts/lib/` 209), 테스트 190파일이 한 루트에 있고 `astro.config.mjs`가 파이프라인 모듈을 import한다(`astro.config.mjs:8-11`). 빌드가 파이프라인 코드와 결합돼 있다.
- 데드코드·중복(`docs/diagnosis/00-inventory.md` §10)과 `prompts/` 미사용 디렉토리가 섞여 있어 경계가 불분명하다.
- P9: 레거시를 복붙하지 않고 재작성. Phase 5까지 레거시는 삭제하지 않는다. 따라서 새 코드와 레거시가 한 레포에 공존해야 한다.
- R5: 소스·규칙·퍼블리셔 플러그인 추가가 작은 변경으로 끝나야 한다. R7: CI에서 외부 호출 0.

## Options

### A. 단일 패키지 + 디렉토리 분리(`site/`, `pipeline/`, `shared/`)

- 장점: 도구 변경 없음.
- 단점: 의존성 경계가 코드 규율에만 의존, 사이트 빌드가 파이프라인 의존성(`rss-parser`, SDK)을 계속 설치, 테스트 분리 어려움.

### B. npm workspaces 모노레포: `apps/site`, `packages/pipeline`, `packages/shared` (결정)

- 장점: 패키지별 `package.json`으로 의존성 경계가 강제됨(사이트는 `@supabase/supabase-js`+astro만, 파이프라인은 SDK·rss-parser·zod), Vercel Root Directory를 `apps/site`로 두면 파이프라인 변경이 사이트 빌드를 유발하지 않음(Ignored Build Step 또는 root 설정), 워크스페이스별 테스트. 기존 npm·lockfile 유지(P8).
- 단점: Vercel 프로젝트 설정 변경(Root Directory) 필요 — §5.5 승인 항목. 레거시 코드와의 공존 기간 동안 루트 `package.json` 스크립트가 두 벌.

### C. 별도 레포(파이프라인 분리)

- 장점: 완전한 격리.
- 단점: 스키마 공유·마이그레이션 조율 비용, Strangler 전환 중 두 레포 동기화, 브리프의 단일 레포 전제(`docs/STATUS.md`, worktree)와 충돌.

## Decision

**B.** 구조:

```
/
├── apps/site/                 # Astro 7 + @astrojs/vercel (ADR-005). 레거시 src/는 Phase 5까지 루트에 유지
│   ├── src/{pages,components,layouts,lib}
│   ├── astro.config.mjs
│   └── package.json
├── packages/shared/           # zod 스키마, Stage/Adapter 인터페이스, 설정 로더, 로거 (런타임 의존성 최소)
├── packages/pipeline/         # CLI 러너, stages/, adapters/, qa/rules/, publishers/
│   ├── bin/pipeline.mjs
│   ├── src/{stages,adapters,qa,publishers,ledger}
│   └── package.json
├── config/                    # pipeline.yaml, sources.yaml, qa.yaml, scoring.yaml, redirects.yaml (+ 레거시 YAML 공존)
├── prompts/                   # news_brief.md, insight_essay.md (버전 헤더) — 레거시 37파일은 archive/로 이동(Phase 5)
├── fixtures/{rss,html,llm}/   # 녹화 페이로드 (R7)
├── supabase/migrations/       # SQL (ADR-003)
├── docs/{adr,architecture,migration,diagnosis,shadow}/
├── scripts/, src/, tests/     # 레거시 — Phase 5 별도 PR로 제거
└── package.json               # workspaces: ["apps/*","packages/*"], 루트 스크립트는 레거시 + 새 러너 둘 다 노출
```

규칙:

- TypeScript(`packages/*`는 `.ts`, `tsc --noEmit` + `tsx`/`node --experimental-strip-types` 실행; Node 22.22는 strip-types 지원) — 레거시 `.mjs`와 구분되고 zod 추론 타입을 쓸 수 있다. 빌드 산출물 없이 실행 가능해야 한다(P8: 번들러 추가 금지).
- 패키지 간 import는 `@cc/shared`만 허용. `packages/pipeline` → `apps/site` import 금지(ESLint `no-restricted-imports`로 강제; ESLint 도입은 Phase 2 §5.6 사전 승인 항목에 포함).
- 테스트는 각 패키지의 `node --test`(현행 러너 유지), CI는 `npm test --workspaces`.
- Vercel: Root Directory `apps/site`, Ignored Build Step으로 `apps/site/**`·`packages/shared/**` 변경 시에만 빌드. 설정 변경은 Phase 2 승인 후 Josh 또는 커넥터 재인가 후 수행.
- 레거시 공존: 루트 `package.json`의 레거시 스크립트는 그대로 두고, `main`은 레거시가 서빙. `rebuild/v2` worktree에서 새 구조를 만들며 레거시 파일은 건드리지 않는다(ADR-006).

## Consequences

- (+) R5: 어댑터·규칙이 패키지 내부 디렉토리 추가로 끝남. R7: `packages/pipeline` 테스트가 fixture만 사용.
- (+) 사이트 빌드가 파이프라인 의존성에서 해방.
- (−) 워크스페이스 전환 초기 비용(Phase 2 1~2일), Vercel 설정 변경 1회.
- (−) 레거시와 새 코드가 같은 레포에 있어 혼동 가능 → `CLAUDE.md`에 경계 명시(06 초안 반영).

## Rejected alternatives & why

- **A**: 경계 미강제, 사이트 빌드의 파이프라인 결합 지속.
- **C**: 조율 비용·브리프 전제 충돌.

## 확인 필요

1. Node 22 `--experimental-strip-types`로 충분한지, 아니면 `tsx` devDependency를 둘지(Phase 2 §5.6 승인).
2. Vercel Root Directory 변경 시 기존 도메인·환경변수 승계 확인.
