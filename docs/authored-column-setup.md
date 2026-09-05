# The Current(저자형 칼럼) 가동 가이드

이 저장소에는 "The Current"라는 저자형 분석 칼럼 엔진이 내장되어 있습니다. 실명 저자
**Josh Jiwoon Inn**(운영자 본인, 설립자 겸 편집장)이 하루 최대 3편, 가장 의미 있는 소식 하나를 골라 일관된 시각의 영문 에세이
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

### 칼럼 대상 범위: 인프라 스토리와 AI 스토리

칼럼 후보는 두 레인 중 하나에서 관련성 0.75 이상이면 됩니다. 인프라 레인은 `infrastructure_relevance_score`(데이터센터·전력·냉각·반도체·클라우드·자본)이고, AI 레인은 `ai_topic_score`(프런티어 모델 출시와 성능, AI 랩 전략과 자금, AI 정책·규제, AI 보안 사고, AI 워크로드의 컴퓨트 수요)입니다. AI 레인 점수는 `classifyAiTopicRelevance`가 계산하며, AI가 제목의 주제가 아니면 0.6에서 상한이 걸립니다. 어느 레인이든 전문가 인사이트 완성과 증거 사실 4개 이상, 이후의 초안·검증 게이트는 동일하게 적용됩니다. 와이어(홈페이지 카드·상세 페이지)의 인프라 게이트는 바뀌지 않았으므로, 순수 AI 기사는 아카이브에 저장된 뒤 칼럼 후보로만 쓰입니다.

큐레이션 모델은 `CURATION_MODEL` 시크릿으로 정하며 기본값은 OpenAI GPT-5.6 Sol(OpenRouter id `openai/gpt-5.6-sol`)입니다. 모델은 풀 전체(최대 30건, 레인 관련성 순)를 보고 고르며, 요청은 JSON 모드입니다. 모델 id가 카탈로그에서 사라지면(400/404) `OPENROUTER_MODEL`로 한 번 재시도하고, 그래도 실패하면 결정론 랭커로 넘어갑니다. 모델이 “해당 없음”(빈 선택)이라고 답하면 그 판단이 그대로 적용되어 그 실행에서는 와이어 기사를 뽑지 않습니다. 실행 로그의 `[curate]` 줄이 어느 경로였는지 보여줍니다.

## 4. 발행 후 수정(사후 편집)

기존 admin 편집기가 칼럼도 지원합니다:
`https://www.computecurrent.com/admin/edit/<칼럼 id>/` (id는 `col_`로 시작,
`src/data/authored-columns.json`에서 확인). 제목·본문·이미지 수정, 숨김/재발행 모두 가능하며
저장 시 main에 커밋되어 자동 재배포됩니다.

## 5. 페르소나·투명성

- 페르소나 정의는 `config/editorial/persona-charter.json` 한 곳에 있습니다(필명, 스탠딩
  포지션 10개, 문체 규칙). 여기를 수정하면 다음 칼럼부터 반영됩니다.
- 공개 페이지: `/author/josh-inn/`(작가 소개+공개 문구), `/ai-disclosure/`의
  "Who Writes The Current" 섹션. **실명 저자(설립자 겸 편집장)가 AI 보조로 작성함을 명시**
  합니다 — 신뢰·광고 정책·윤리 모두를 위한 장치이니 제거하지 마세요.

## 6. 로컬에서 미리 돌려보기 (선택)

```bash
# 키를 로컬 .env 없이 셸에 직접 넣고 드라이런(파일 안 씀, 본문 출력)
OPENROUTER_API_KEY=sk-... node scripts/generate-authored-column.mjs --dry-run

# 검증까지 통과하면 실제로 저장
OPENROUTER_API_KEY=sk-... node scripts/generate-authored-column.mjs --force
```

## 7. 구조 다양성 계약 (v2)

칼럼이 템플릿처럼 읽히지 않도록 고정 섹션 제목은 폐지되었습니다.

- 'On My Watchlist' / 'Where I Could Be Wrong'은 **영구 금지 제목**입니다(게이트가 차단).
- 모든 섹션 제목은 그 칼럼의 논증에서 새로 발명해야 하며, 최근 15편에서 쓴 제목(유사 표현 포함)을
  재사용하면 검증에서 탈락합니다. 리드 문장이 최근 칼럼과 겹쳐도 탈락합니다.
- 반론 섹션과 전방 관측(마무리) 섹션은 여전히 필수지만, 제목은 매번 다릅니다.

## 8. 증거 피규어 (표·스탯·바 차트)

모든 칼럼은 본문 사이에 **1~3개의 증거 피규어**를 싣습니다. 수치·팩트는 해당 스토리의
클레임 렛저(verified_primary)에서만 가져오며, 관련성 필터가 주간 라운드업형 소스의 무관한
항목을 걸러냅니다. 수치가 풍부하면 바 차트/수치 표, 부족하면 출처 표기가 붙은 팩트 표가
자동 구성됩니다. 편집은 admin에서 칼럼 레코드의 `figures` 배열을 수정하면 됩니다.

## 9. 칼럼 히어로 이미지 (image2)

`OPENAI_API_KEY` 시크릿을 GitHub Actions에 등록하면 칼럼 히어로 이미지가 wire 기사와 동일한
image2(OpenAI 이미지) 경로로 **칼럼 내용 기반** 생성됩니다(hero/og/thumbnail 세트,
`public/generated/col_.../`). 키가 없으면 원천 기사 이미지를 재사용하는 기존 동작이 유지되며
발행은 막히지 않습니다.
