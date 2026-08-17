# The Current(저자형 칼럼) 가동 가이드

이 저장소에는 "The Current"라는 저자형 분석 칼럼 엔진이 내장되어 있습니다. 필명 페르소나
**Rowan Hale**이 하루 최대 3편, 가장 의미 있는 소식 하나를 골라 일관된 시각의 영문 에세이
(1,200~1,800단어)를 작성합니다. 품질 게이트 14종(길이·구조·반론 섹션·금지 문구·수치 근거·
저작권 오버랩·반복·문체 점수 등)을 전부 통과해야만 발행되며, **실패하면 아무것도 발행하지
않습니다**(템플릿 대체 없음).

## 1. 가동 전제: OpenRouter 키 (필수, 이것만 하면 켜집니다)

1. [openrouter.ai](https://openrouter.ai) 가입 → **Keys**에서 API 키 생성.
2. **Credits**에서 $10 정도 충전 (표준 모델 기준 월 $5~15 예상 — 칼럼 1편당 약 $0.12~0.18).
3. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**:
   - `OPENROUTER_API_KEY` = 발급받은 키
4. (선택) 모델을 바꾸고 싶으면 시크릿 추가:
   - `AUTHORED_COLUMN_MODEL` (기본 `anthropic/claude-sonnet-4.5`)
   - `EXPERT_LENS_MODEL` (wire 기사 본문용, 기본 동일)
   - `OPENROUTER_MODEL` (선별·요약용 경량 모델, 기본 `openai/gpt-4o-mini`)

키가 없으면 칼럼 엔진은 조용히 skip하고(`llm_disabled` 로그), wire 피드는 평소처럼 돕니다.

## 2. 첫 칼럼 발행하기

키 등록 후 두 가지 방법:

- **자동**: 다음 정기 실행(00:05 / 08:05 / 16:05 KST)에서 조건이 맞으면 자동 발행.
- **즉시**: GitHub → **Actions → Update News → Run workflow** →
  `force_column` 체크 → 실행. (하루 상한·간격 제한을 무시하고 1편 시도)

발행되면 커밋 로그에 `authored column published: <slug>`가 찍히고, Vercel 재배포 후:
- 홈페이지 상단에 칼럼 히어로가 나타나고
- `/column/` 인덱스와 `/column/<slug>/` 상세 페이지, RSS·사이트맵에 반영됩니다.

실행 로그에서 `authored column: none this run (<이유>)`가 보이면 그 회차는 기준 미달로
건너뛴 것입니다(정상 동작). 이유는 `scripts/state/pipeline-state.json`의
`authored.lastFailure`에도 기록됩니다.

## 3. 운영 파라미터 (전부 GitHub 시크릿/환경변수로 조정)

| 변수 | 기본값 | 의미 |
| --- | --- | --- |
| `AUTHORED_COLUMNS_PER_DAY` | 3 | 하루 최대 칼럼 수 |
| `AUTHORED_COLUMN_MIN_GAP_HOURS` | 4 | 칼럼 간 최소 간격 |
| `AUTHORED_COLUMN_ENABLED` | 1 | 0이면 엔진 완전 비활성화 |
| `LLM_RUN_BUDGET_TOKENS` | 60000 | 실행당 토큰 상한(초과 시 LLM 작업 중단) |
| `LLM_RUN_BUDGET_CALLS` | 40 | 실행당 호출 상한 |
| `AUTHORED_MIN_HUMAN_STYLE` | 0.84 | 문체 점수 하한 (낮추면 발행률↑ 품질↓) |
| `AUTHORED_MIN_INSIGHT_DENSITY` | 0.78 | 분석 밀도 하한 |

## 4. 발행 후 수정(사후 편집)

기존 admin 편집기가 칼럼도 지원합니다:
`https://www.computecurrent.com/admin/edit/<칼럼 id>/` (id는 `col_`로 시작,
`src/data/authored-columns.json`에서 확인). 제목·본문·이미지 수정, 숨김/재발행 모두 가능하며
저장 시 main에 커밋되어 자동 재배포됩니다.

## 5. 페르소나·투명성

- 페르소나 정의는 `config/editorial/persona-charter.json` 한 곳에 있습니다(필명, 스탠딩
  포지션 10개, 문체 규칙). 여기를 수정하면 다음 칼럼부터 반영됩니다.
- 공개 페이지: `/author/rowan-hale/`(작가 소개+공개 문구), `/ai-disclosure/`의
  "Pen Names and The Current" 섹션. **필명이 실존 인물이 아니고 AI 보조로 작성됨을 명시**
  합니다 — 신뢰·광고 정책·윤리 모두를 위한 장치이니 제거하지 마세요.

## 6. 로컬에서 미리 돌려보기 (선택)

```bash
# 키를 로컬 .env 없이 셸에 직접 넣고 드라이런(파일 안 씀, 본문 출력)
OPENROUTER_API_KEY=sk-... node scripts/generate-authored-column.mjs --dry-run

# 검증까지 통과하면 실제로 저장
OPENROUTER_API_KEY=sk-... node scripts/generate-authored-column.mjs --force
```
