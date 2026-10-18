# 06 — `CLAUDE.md` 초안 (Phase 2에서 레포 루트에 생성)

아래 블록을 그대로 `CLAUDE.md`로 쓴다. `AGENTS.md`(Codex 정책)와 충돌하는 부분은 없고, 리빌드 세션에 필요한 운영 규칙을 브리프 §5에서 가져와 이 레포의 실측 함정을 덧붙였다.

---

```markdown
# CLAUDE.md — computecurrent.com 리빌드 운영 규칙

이 파일은 리빌드 세션의 운영 규칙이다. 편집 정책은 `AGENTS.md`, 실행 단계는 `REBUILD_BRIEF.md`, 현재 상태는 `docs/STATUS.md`를 본다.

## 0. 세션 시작·종료
- 시작: `REBUILD_BRIEF.md`, `docs/STATUS.md`를 읽는다. 이번 세션의 Phase는 STATUS.md의 `phase`와 Josh의 킥오프 문구가 일치할 때만 실행한다.
- 종료: `docs/STATUS.md`를 갱신하고 브리프 §7 보고 포맷으로 보고한다. 보고 없이 다음 Phase로 넘어가지 않는다.

## 1. Truth anchor
- `docs/STATUS.md`가 단일 진실이다. 직전 Phase가 PASS면 그 이하로 돌아가지 않는다. 돌아가야 하면 `blocked (reason)`으로 보고하고 멈춘다.
- 프로덕션 기준은 `origin/main` + Vercel의 READY 배포 커밋이다. 로컬 HEAD는 기준이 아니다.

## 2. 상태 어휘
`started | partial | done | blocked (reason)` 네 가지만 쓴다. 워커 `done`은 오케스트레이터 검증 전까지 `completed`가 아니다(`AGENTS.md` 참조).

## 3. 승인 게이트
- Phase 간 이동, Phase 3의 모듈(3a~3i) 이동은 Josh의 명시 승인이 필요하다.
- 사전 승인 필요: 패키지 추가(lockfile 재설치 `npm ci`는 예외), DB 스키마 마이그레이션, 스케줄 변경, 프로덕션 배포, 외부 서비스 신규 연결, Vercel 프로젝트·DNS·cron·환경 변수 변경.
- 승인 요청은 §7 보고를 먼저 제출한다.

## 4. STOP-THE-LINE (즉시 중단 후 보고)
- 데이터 손실 가능성: 테이블 drop/truncate, `src/data/*.json`·`public/generated/` 대량 삭제, Supabase `archived_articles` 변경.
- 프로덕션 가용성 영향: `main` 직접 push, `vercel.json`·`astro.config.mjs` 변경을 수반하는 배포.
- 시크릿 노출 가능성, 예상 밖 파괴적 명령, 런당 LLM/이미지 비용이 설정 상한 초과.
- Phase 0~4에서 `--dry-run`이 아닌 실제 publish 실행 시도.

## 5. 금지
- 환경 변수 **값** 출력·로그·커밋. 이름만 다룬다. `.env*`, 키 파일, Supabase service role 키 열람 금지(명시 요청 제외).
- 승인 없는 삭제(테이블·파일·브랜치), force-push, history 재작성.
- 한 번에 20개 파일 이상 자동 편집(사전 계획 제시 필수).
- 레거시 코드를 새 구조로 복사·붙여넣기(P9). 검증된 규칙·프롬프트·스키마만 추출해 재작성한다.

## 6. 작업 위치
- Phase 2 이후 리빌드 작업은 `rebuild/v2` 브랜치의 worktree(`git worktree add ../computecurrent-rebuild rebuild/v2`)에서 한다. `main`은 레거시가 계속 서빙한다.
- Phase 0~1 산출물(docs)은 세션 지정 브랜치 → draft PR → `main`.

## 7. 이 레포의 실측 함정 (반드시 기억)
- `scripts/pipeline.mjs`에는 dry-run이 없다. `PIPELINE_OFFLINE=1`은 본문 추출만 끄고 RSS는 계속 가져오며, `LLM_PROVIDER=disabled`도 `src/data` JSON과 폴백 이미지를 쓴다. 진단·replay는 `scripts/diagnose/funnel.mjs`처럼 lib 함수를 메모리에서만 호출한다.
- `npm test`는 `astro build`를 돌리고, `scripts/audit-omo-ultra-current-state.mjs`는 tracked 문서 `docs/omo-ultra-audit.md`를 쓴다. `npm run content:cycle`은 `.cache/content-cycle`을 만든다. 진단 세션에서는 돌리지 않는다. 오프라인 테스트는 `test:quality-gates`, `test:claim-ledger`, `test:signal-clusters`, `test:source-expansion`와 개별 `node --test tests/<file>`.
- `.gitignore`의 bare `evidence/`는 `docs/diagnosis/evidence/`도 무시한다. 증거는 `docs/diagnosis/mac-jobs/`, `docs/diagnosis/logs/`에 둔다.
- 생성은 Josh의 Mac Codex 태스크(00:45/08:45/16:45 KST)에서 돈다. GitHub Actions는 검증만, Vercel에는 cron이 없다. 클라우드 세션에서는 RSS 호스트·Vercel 로그·Mac 잡 레코드에 접근할 수 없다.
- 구독 모드에서 컬럼 단계 실패는 런 원장 기록 전에 abort 한다(`scripts/pipeline.mjs:445`). `runHistory`는 완주 런만 담는다.
- 발행 = JSON 커밋 → `main` push → Vercel 전체 재빌드. 빌드 입력을 깨뜨리는 변경은 곧 서비스 영향이다.
- `prompts/` 디렉토리는 런타임에서 쓰이지 않는다. 실제 프롬프트는 `scripts/lib/{curate,content,expert-lens,authored-column-engine}.mjs` 인라인이다.

## 8. 보고 포맷
`REBUILD_BRIEF.md` §7을 그대로 쓴다. "완료했습니다" 한 줄은 보고가 아니다.
```
