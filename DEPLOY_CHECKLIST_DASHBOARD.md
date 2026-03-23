# AI News Portal — Dashboard 배포 검증 체크리스트

## 목적
GitHub Actions 기반 뉴스+대시보드 자동 갱신 파이프라인이 실배포 브랜치에서 정상 동작하는지 재현 가능한 형태로 점검한다.

## 0) 사전 준비
- [ ] 배포 대상 브랜치 확인 (`main` 또는 운영 브랜치)
- [ ] 변경 반영 대상 커밋이 브랜치에 이미 푸시되었는지 확인
- [ ] Vercel(또는 배포 타깃)에 같은 브랜치가 연결되어 있는지 확인

## 1) 코드/워크플로우 무결성 확인
- [ ] `ai-news-portal/.github/workflows/update-news.yml`
  - [ ] `node scripts/sync-dashboard-data.cjs` 존재
  - [ ] 6시간 뉴스 갱신 + 15분 대시보드 갱신 cron 설정 존재
  - [ ] 변경 감지 단계(`git diff --quiet`)로 불필요 커밋 차단 설정 존재
- [ ] `package.json`
  - [ ] `sync:dashboard-data: node ./scripts/sync-dashboard-data.cjs`
  - [ ] `build: npm run sync:dashboard-data && astro build`
- [ ] `scripts/sync-dashboard-data.cjs`
  - [ ] `src/data/cron-registry-snapshot-latest.json` 기준 우선 참조
  - [ ] 결과 파일 `public/dashboard-data.json` 생성
- [ ] `src/pages/dashboard.astro`
  - [ ] `/dashboard-data.json` fetch 후 렌더링 동작
  - [ ] 실패 시 fallback 처리

## 2) 로컬 빌드/유닛 체크
- [ ] 로컬에서 실행
  - `npm install`
  - `npm run build`
- [ ] 체크 항목
  - [ ] `/` 빌드 성공
  - [ ] `/dashboard` 빌드 성공
  - [ ] `public/dashboard-data.json` 파일 생성/갱신 확인

## 3) 워크플로우 동작 검증 (실제 배포 브랜치)
- [ ] GitHub Actions에서 `Update News & Dashboard` 워크플로우 수동 실행
  - `Run workflow` → `workflow_dispatch` 실행
- [ ] 실행 로그 확인
  - [ ] `Run dashboard data sync` 성공
  - [ ] `Check for changes` 스텝이 변화 유무 출력
  - [ ] (변경 존재 시) `Commit and Push` 스텝 성공
- [ ] 커밋 기록 확인
  - [ ] 커밋 메시지 형식: `chore: auto-update news + dashboard data [skip ci]`
  - [ ] `src/data/latest-news.json` 또는 `public/dashboard-data.json` 변경만 포함되었는지 확인

## 4) 배포 반영/최종 노출 확인
- [ ] Vercel 최신 배포 상태 확인(또는 타겟 배포 대상)
- [ ] `https://<production-domain>/` 접근 및 뉴스 갱신 반영 확인
- [ ] `https://<production-domain>/dashboard` 접근 및 핵심 카드 렌더링 확인
  - [ ] Top Gun
  - [ ] 진행률
  - [ ] 알림
  - [ ] 대기열/타임라인
- [ ] 대시보드에서 `Updated` 타임스탬프가 최근 동기화 시간과 일치하는지 확인

## 5) 주기성 검증(24h 샘플)
- [ ] 24시간 내 최소 1회 (`*/15`) 스케줄 실행 흔적 확인
- [ ] 1회 이상 `public/dashboard-data.json` 변경 및 커밋 생성 유무 확인
- [ ] 스냅샷 타임라인이 과거 데이터 대비 최신 시각으로 갱신되는지 확인

## 6) 이상 징후 시 즉시 조치
- [ ] `sync-dashboard-data.cjs` 실행 실패 시: 로그 스택에서 스냅샷 경로/권한 이슈 확인
- [ ] `src/data/cron-registry-snapshot-latest.json` 비어있음/삭제 시: 워크플로우에서 대체 경로 동작 여부 확인
- [ ] 15분 스케줄이 무반응인 경우: GitHub Actions 스케줄이 비활성화/리미트 상태인지 확인

## 7) 결과 기록
- [ ] `SESSION-STATE.md`에 최종 점검 결과 1줄 기록
- [ ] 실패/이슈는 `MEMORY.md` 또는 해당 작업 문서에 원인·조치·결과 남김
