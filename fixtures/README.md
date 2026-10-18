# fixtures/ — 녹화 입력 (R7 재현성)

`pipeline run --replay --fixture <name>`과 CI 테스트는 이 디렉토리만 읽고 네트워크를 쓰지 않는다. replay 모드에서는 `ctx.fetch`가 호출 즉시 `NETWORK_DISABLED`로 throw 한다.

| 경로 | 내용 | 출처·한계 |
|---|---|---|
| `rss/sample.xml` | RSS 2.0, 30개 item | **라이브 캡처가 아님.** 클라우드 세션에서 피드 호스트에 접근할 수 없어(Phase 2, 2026-10-18) 커밋된 `src/data/news-pool.json`(커밋 `32e6e8720b5388a50dddc30293402105710c2dfc`, 2026-10-11)의 실제 title/url/pubDate/snippet을 RSS로 재직렬화했다. Phase 3a에서 실제 피드 응답으로 교체한다. |
| `llm/news_brief.sample.json` | `LlmResponse` 1건, 본문은 `NewsBrief` 스키마를 통과하는 **합성** 샘플 | 모델 출력이 아니다. 스키마·러너 배선 검증용. Phase 3d에서 실제 응답 녹화로 교체 |
| `html/` | 본문 추출용 HTML 녹화 (Phase 3a에서 추가) | 비어 있음 |

규칙:

- fixture에 시크릿·개인정보·전문(full text) 저작물을 넣지 않는다. 설명(description)은 600자 이내 발췌로 제한한다.
- 새 fixture는 이 표에 출처(커밋 또는 캡처 일시·URL)와 한계를 적는다.
- 어댑터는 `fixtures/<kind>/<name>.<ext>`를 읽고, 없으면 `sample`로 폴백하지 않는다(명시적 실패).
