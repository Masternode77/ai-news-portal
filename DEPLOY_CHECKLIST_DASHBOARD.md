# Compute Current — 후보 배포 및 인증 관리자 검증 체크리스트

## 목적

현재 후보는 정적 Astro 7.2 사이트와 인증된 관리자 API를 사용한다. 이 문서는
폐기된 공개 대시보드, 대시보드 데이터 파일, 또는 별도 대시보드 cron 스냅샷을
배포 대상으로 간주하지 않는다. 외부 서비스의 승인·법률 상태를 선언하는 문서가
아니며, 각 운영자가 실제 증거를 기록할 수 있도록 하는 점검표다.

## 1) 후보 범위와 정적 빌드

- [ ] `npm run check`와 대상 테스트를 실행해 현재 후보를 확인한다.
- [ ] `npm run build`가 정적 Astro 7.2 출력물을 생성하는지 확인한다.
- [ ] 공개 `/dashboard` 경로, `dashboard-data.json`, 대시보드 cron 스냅샷, 그리고
  `sync-dashboard-data` 작업을 새 배포 절차나 공개 검증 대상으로 추가하지 않는다.
- [ ] 공개 사이트 검증은 `/`, 공개 기사 경로, `/privacy/`, `/terms/`, `/robots.txt`,
  `/sitemap.xml`, 그리고 필요할 때 `/ads.txt`에 한정해 기록한다.

## 2) 인증된 관리자 점검

- [ ] [`docs/admin-setup.md`](docs/admin-setup.md)에 따라
  `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (`scrypt$...`),
  `ADMIN_SESSION_SECRET`을 실제 배포 환경에 구성한다.
- [ ] `scripts/admin-password-hash.mjs`로 비밀번호 해시를 생성한다. 평문
  `ADMIN_PASSWORD` 또는 이전 `ADMIN_AUTH_SECRET`을 구성하거나 기록하지 않는다.
- [ ] 생산 환경에서는 Vercel Firewall의 IP 기반 `POST /api/admin/login` 제한을
  게시하고, 여섯 번째 제어 테스트가 HTTP 429인지 확인한 뒤에만
  `ADMIN_VERCEL_RATE_LIMIT_READY=true`을 설정한다. 이 값은 외부 제한의 증명이
  아니라 그 검증 완료에 대한 운영자 attestation이다.
- [ ] `/admin.html`에서 로그인하고, 인증 후 `/admin/dashboard/`가
  `/api/admin/dashboard`를 통해 로드되는지 확인한다.
- [ ] 인증되지 않은 요청이 `/api/admin/login` 외 관리자 API를 통과하지 않는지
  확인한다. 변경 요청은 세션과 CSRF 토큰을 포함하는 현재 API 계약을 따른다.

## 3) 광고·분석 활성화 전 외부 handoff

- [ ] 실제 AdSense 계정 ID가 준비되었을 때만 `PUBLIC_ADSENSE_CLIENT`를 설정하고,
  review 중에도 `/ads.txt`가 해당 ID의 소유권 레코드를 제공하는지 확인한다.
- [ ] 계정/사이트 승인, Google 인증 CMP 게시, EEA/UK/CH에서 accept·reject·revoke
  테스트, 법률 검토, 실제 ads.txt ID 검증을 증거와 함께 완료하기 전에는
  `PUBLIC_GOOGLE_CMP_READY=false`를 유지한다. 이 프로젝트는 custom ConsentBanner를
  제공하지 않으며, CMP는 외부 Google-certified handoff다.
- [ ] 의미 있고 수동 검토한 독창적 기사 인벤토리와 canonical
  `publication_integrity.ok=true`인 공개 detail article이 최소 하나인지 확인한다.
  이 코드 수준의 0개/무효 인벤토리 차단은
  `PUBLIC_ADSENSE_CONTENT_READY=true`만으로 우회할 수 없다.
- [ ] 초기에는 수동 광고 unit만 사용하고 Auto ads는 비활성화한다. 승인 이후에도
  production DOM·배치·접근성 QA를 문서화하기 전에는 Auto ads를 켜지 않는다.
- [ ] CMP 준비, 콘텐츠 준비, route gate, 그리고 정책 페이지의 무태그 상태는
  [`docs/monetization-setup.md`](docs/monetization-setup.md)와
  [`docs/adsense-operations-runbook.md`](docs/adsense-operations-runbook.md)를
  기준으로 함께 검증한다.

## 4) 정적 보안 헤더와 CSP 위험 수용

- [ ] `vercel.json`의 정적 호환 헤더와 `/ads.txt` Content-Type을 확인한다.
- [ ] 정적 Astro 7.2 출력은 검증된 호환 정책을 CSP로 전달할 수 있지만, 이 후보에는
  enforced CSP가 없다는 위험 수용을 배포 기록에 남긴다. 선택한 AdSense/CMP 조합에서
  per-request nonce를 발급할 수 없고 호환 정책도 아직 검증하지 않았기 때문이다.
- [ ] 수집기 없는 report-only CSP를 추가하지 않는다. 이후 report-only 또는 enforced
  CSP는 per-request nonce-capable 아키텍처로 이전하거나, 정적 출력·AdSense·선택 CMP와
  호환되는 정책 및 report collector를 검증한 경우에만 검토한다.

## 5) 결과 기록

- [ ] 실행한 명령, 대상 배포 URL, 인증/차단 결과, 외부 제어 검증 시각, 담당자를
  배포 변경 기록에 남긴다.
- [ ] 외부 승인·법률 검토·CMP 인증을 추정하거나 완료된 것으로 표시하지 않는다.
- [ ] 실패 시 attestation을 true로 두지 말고, 원인을 해결하고 다시 증거를 수집한 뒤
  재검증한다.
