# The Current(저자형 칼럼) 가동 가이드

이 저장소에는 "The Current"라는 저자형 분석 칼럼 엔진이 내장되어 있습니다. 실명 저자
**Josh Jiwoon Inn**(운영자 본인, 설립자 겸 편집장)이 하루 최대 3편, 가장 의미 있는 소식 하나를 골라 일관된 시각의 영문 에세이
(1,200~1,800단어)를 작성합니다. 품질 게이트 14종(길이·구조·반론 섹션·금지 문구·수치 근거·
저작권 오버랩·반복·문체 점수 등)을 전부 통과해야만 발행되며, **실패하면 아무것도 발행하지
않습니다**(템플릿 대체 없음).

## 1. 가동 전제: Mac의 구독 로그인

현재 기본 경로는 OpenRouter API가 아니라 Mac의 공식 CLI입니다.
Codex는 ChatGPT 구독으로 로그인하고 `gpt-6-astra`를 사용합니다.
Claude Code는 Max 구독으로 로그인하고 `claude-fable-5-1`로 논지·초안·편집을 수행합니다.
Astra가 원문 근거를 교차 검토합니다. 로그인·한도·모델 오류는 실행 실패로 보고하며
유료 API나 구형 모델로 자동 전환하지 않습니다.

[구독 생성 설정](subscription-generation.md)의 로그인, 추가 과금 차단 확인,
CLI 호환성 점검을 먼저 마치세요. 키 발급이나 GitHub로 구독 인증정보 복사는 필요 없습니다.

## 2. 첫 칼럼 생성하기

Mac 저장소에서 `npm run check:subscription`으로 준비 상태를 확인한 뒤
`npm run generate:subscription`을 실행합니다. 기존 Mac Codex 작업이
본문 생성, 고유한 네이티브 이미지 생성·검토·등록, 최종 품질 검사 순서를 수행합니다.
명령 자체는 커밋·푸시하지 않습니다. 발행 권한이 있는 기존 작업만 검증 후 발행합니다.
GitHub의 Application Validation은 검증 전용이므로 수동 실행해도 칼럼을 생성하지 않습니다.

기존 하루 세 번(00:05 / 08:05 / 16:05 KST) 일정은 Mac의 기존 자동화에 적용합니다.
저장소 pull만으로 앱의 예약 설정이 설치되지는 않습니다. 새 작업을 중복 생성하지 마세요.
적격 후보가 없으면 정상 건너뛰기이며, 인증·한도 오류와 구분해야 합니다.

## 3. 운영 파라미터 (Mac 작업 환경변수)

| 변수 | 기본값 | 의미 |
| --- | --- | --- |
| `LLM_PROVIDER` | subscription | 공식 구독 CLI 사용 |
| `SUBSCRIPTION_INCLUDED_USAGE_CONFIRMED` | 미설정 | 포함 사용량·추가 과금 차단 확인 후 1로 설정 |
| `AUTHORED_COLUMNS_PER_DAY` | 3 | 하루 최대 칼럼 수 |
| `AUTHORED_COLUMN_MIN_GAP_HOURS` | 4 | 칼럼 간 최소 간격 |
| `AUTHORED_COLUMN_ENABLED` | 1 | 0이면 칼럼 생성 비활성화 |
| `LLM_RUN_BUDGET_CALLS` | 60 | 실행당 성공 호출 상한 |

API용 토큰 예산은 구독 잔여 한도를 측정하지 않습니다. 실제 구독 사용 한도는 각 서비스가 관리합니다.
기존 추출·근거·반복·문체·품질 기준을 통과해야 발행할 수 있습니다.

### 칼럼 대상 범위: 인프라 스토리와 AI 스토리

칼럼 후보는 두 레인 중 하나에서 관련성 0.75 이상이면 됩니다. 인프라 레인은 `infrastructure_relevance_score`(데이터센터·전력·냉각·반도체·클라우드·자본)이고, AI 레인은 `ai_topic_score`(프런티어 모델 출시와 성능, AI 랩 전략과 자금, AI 정책·규제, AI 보안 사고, AI 워크로드의 컴퓨트 수요)입니다. AI 레인 점수는 `classifyAiTopicRelevance`가 계산하며, AI가 제목의 주제가 아니면 0.6에서 상한이 걸립니다. 어느 레인이든 전문가 인사이트 완성과 증거 사실 4개 이상, 이후의 초안·검증 게이트는 동일하게 적용됩니다. 와이어(홈페이지 카드·상세 페이지)의 인프라 게이트는 바뀌지 않았으므로, 순수 AI 기사는 아카이브에 저장된 뒤 칼럼 후보로만 쓰입니다.

큐레이션은 Astra를 사용합니다. OpenRouter 카탈로그 자동 갱신은 중단됐으며, 구독 모델은 코드에서 명시적으로 고정합니다.

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
# 인증 준비 상태만 확인. 글을 생성하거나 저장하지 않습니다.
node scripts/run-subscription-news.mjs --check

# 실제 구독 사용량을 소비해 칼럼을 생성하되 파일 저장은 하지 않습니다.
# 위 설정 가이드의 구독·과금 확인을 먼저 완료해야 합니다.
node scripts/generate-authored-column.mjs --dry-run
```

전체 파이프라인 실행 순서만 확인하려면 `node scripts/run-subscription-news.mjs --dry-run`을 사용하세요.
이 명령의 dry-run은 모델을 호출하지 않습니다. 두 명령의 dry-run 의미는 다릅니다.


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

## 9. 칼럼 히어로 이미지 (Codex)

현재 Codex 세션의 이미지 생성 도구로 칼럼 내용에 맞는 이미지를 만들고 시각 검토한 뒤,
로컬 파일을 다음 명령으로 등록합니다.

```sh
node scripts/import-codex-image.mjs --id <column-id> --file <generated-image-path>
```

등록 과정은 hero/og/thumbnail 세트를 `public/generated/articles/` 아래에 만들고 매니페스트에
원본 해시와 프롬프트 지문을 기록합니다. GitHub Actions와 Vercel은 등록된 파일 또는 로컬
fallback만 사용하며 별도의 이미지 API 키를 요구하지 않습니다. 세부 절차는
`docs/codex-image-workflow.md`를 따릅니다.
