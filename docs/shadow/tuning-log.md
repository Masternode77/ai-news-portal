# Shadow run — 튜닝 로그 (Phase 4)

규칙: 설정 **값만** 바꾼다(`config/scoring.yaml`·`config/qa.yaml`·`config/banned-phrases.yaml`·`config/pipeline.yaml` caps/budget). 바꾸면 그 파일의 `version`을 올리고(`candidates.rubric_version`·`qa_results.evidence.qa_version`·`drafts.body.checks.banned.version`이 새 값을 남긴다) 아래에 한 줄을 적는다. 코드 변경은 튜닝이 아니라 모듈 PR이다.

| # | 일시 | 파일 · version | 바꾼 값 (전 → 후) | 근거(compare.md 행 / 샘플) | 기대 효과 | 결과(다음 런) |
|---|---|---|---|---|---|---|
| | | | | | | |
