# Shadow run — 튜닝 로그 (Phase 4)

규칙: 설정 **값만** 바꾼다(`config/scoring.yaml`·`config/qa.yaml`·`config/banned-phrases.yaml`·`config/pipeline.yaml` caps/budget). 바꾸면 그 파일의 `version`을 올리고(`candidates.rubric_version`·`qa_results.evidence.qa_version`·`drafts.body.checks.banned.version`이 새 값을 남긴다) 아래에 한 줄을 적는다. 코드 변경은 튜닝이 아니라 모듈 PR이다.

| # | 일시 | 파일 · version | 바꾼 값 (전 → 후) | 근거(compare.md 행 / 샘플) | 기대 효과 | 결과(다음 런) |
|---|---|---|---|---|---|---|
| 2 | 2026-10-31 | `config/qa.yaml` · 2026-10-25.1 → 2026-10-31.1 | `UNGROUNDED_ENTITY.params.token_fallback` 신설: (없음=false) → `true` | `compare.md` §3 5·6행 — "Nottinghamshire Newark"·"Czechia RRF"처럼 원문의 두 이름을 한국어 어순으로 붙인 바이그램이 hard 거절(run 4 초안 2건 모두) | 토큰별로 원문에 있는 재조합 이름은 통과, 원문에 없는 토큰("Portugal")은 계속 실패. 같은 PR의 코드 ①~③(통화 글자·월 숫자·복합 수사)은 튜닝이 아니라 3d 모듈 변경(3d notes §5-11) | run 5(16:45 KST)부터 — `UNGROUNDED_ENTITY` 거절 중 `token_grounded`로 넘어가는 비율 |
| 1 | 2026-10-30 | `config/scoring.yaml` · 2026-10-23.3 → 2026-10-30.1 | `selection.skip_review_status` 신설: (없음) → `[rejected, pending]` | `compare.md` 2·3행 — 같은 후보 2건이 연속 선택·생성(거절 초안 재생성 루프, 런당 ≈ $0.09) | 거절·보류 초안의 후보가 슬롯을 차지하지 않고 다음 통과 후보가 선택됨(`PREVIOUSLY_REJECTED`·`PENDING_REVIEW`); 3c notes §5-6 | (머지 뒤 첫 cron 런에서 확인) |
