# Shadow run — 튜닝 로그 (Phase 4)

규칙: 설정 **값만** 바꾼다(`config/scoring.yaml`·`config/qa.yaml`·`config/banned-phrases.yaml`·`config/pipeline.yaml` caps/budget). 바꾸면 그 파일의 `version`을 올리고(`candidates.rubric_version`·`qa_results.evidence.qa_version`·`drafts.body.checks.banned.version`이 새 값을 남긴다) 아래에 한 줄을 적는다. 코드 변경은 튜닝이 아니라 모듈 PR이다.

| # | 일시 | 파일 · version | 바꾼 값 (전 → 후) | 근거(compare.md 행 / 샘플) | 기대 효과 | 결과(다음 런) |
|---|---|---|---|---|---|---|
| 1 | 2026-10-30 | `config/scoring.yaml` · 2026-10-23.3 → 2026-10-30.1 | `selection.skip_review_status` 신설: (없음) → `[rejected, pending]` | `compare.md` 2·3행 — 같은 후보 2건이 연속 선택·생성(거절 초안 재생성 루프, 런당 ≈ $0.09) | 거절·보류 초안의 후보가 슬롯을 차지하지 않고 다음 통과 후보가 선택됨(`PREVIOUSLY_REJECTED`·`PENDING_REVIEW`); 3c notes §5-6 | (머지 뒤 첫 cron 런에서 확인) |
