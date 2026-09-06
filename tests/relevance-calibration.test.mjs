import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FULL_MEMO_RELEVANCE_THRESHOLD,
  SIGNAL_CARD_RELEVANCE_THRESHOLD,
  classifyInfrastructureRelevance,
} from '../scripts/lib/relevance-classifier.mjs';
import { routeStrictInfrastructureRelevance } from '../scripts/lib/strict-infrastructure-relevance-router.mjs';

const cases = [
  {
    id: 'ko-grid-code',
    expectedRelevant: true,
    article: {
      title: 'AI 데이터센터 전력계통 연계 기준 연구회 가동',
      snippet: 'GPU 부하 변동에 대응해 계통 접속 기준과 ESS·UPS 운용을 검토한다.',
      articleText: '기후에너지환경부는 데이터센터 전력 수요와 변전소, 송전망 영향을 검토해 올해 전력망 연계 기준을 마련한다.',
    },
  },
  {
    id: 'ko-power-supply',
    expectedRelevant: true,
    article: {
      title: '호남권·용인 산업단지에 20GW 이상 전력 공급 계획',
      snippet: '한국전력은 변전소와 송전선로를 단계적으로 구축한다.',
      articleText: '데이터센터와 반도체 설비의 전력 수요에 맞춰 계통 연계, 인허가, 부지 일정을 조정한다.',
    },
  },
  {
    id: 'ko-cooling',
    expectedRelevant: true,
    article: {
      title: 'AI 데이터센터 냉각시스템 수출 지원 확대',
      snippet: '칠러 생산과 액침냉각 실증에 정책 자금을 투입한다.',
      articleText: '고밀도 서버 랙의 발열을 낮추는 냉각 용량과 상용 프로젝트 발주가 핵심이다.',
    },
  },
  {
    id: 'en-control',
    expectedRelevant: true,
    article: {
      title: 'Utility schedules a 400 MW AI data center interconnection',
      snippet: 'Two substations and a transmission upgrade control campus delivery.',
    },
  },
  {
    id: 'ko-consumer-ai',
    expectedRelevant: false,
    article: {
      title: '새 인공지능 챗봇이 사진 앱과 글쓰기 도우미 기능 공개',
      snippet: '소비자 앱의 화면과 구독 기능을 개편했다.',
    },
  },
  {
    id: 'ko-semiconductor-stocks',
    expectedRelevant: false,
    article: {
      title: 'AI 반도체 관련주 급등, 증시에서 수혜주 관심',
      snippet: '주가 상승률과 개인 투자자 매수세를 정리했다.',
    },
  },
  {
    id: 'ko-ai-policy-general',
    expectedRelevant: false,
    article: {
      title: '인공지능 윤리 교육과 챗봇 활용 지침 발표',
      snippet: '학교 수업과 소비자 서비스 이용 원칙을 설명한다.',
    },
  },
  {
    id: 'en-consumer-control',
    expectedRelevant: false,
    article: {
      title: 'AI photo app adds a chatbot for social video creators',
      snippet: 'The consumer app changes filters and subscription plans.',
    },
  },
];

test('calibration keeps the established 0.75 and 0.55 thresholds', () => {
  assert.equal(FULL_MEMO_RELEVANCE_THRESHOLD, 0.75);
  assert.equal(SIGNAL_CARD_RELEVANCE_THRESHOLD, 0.55);
});

test('bilingual calibration separates direct infrastructure from consumer and market chatter', () => {
  const results = cases.map((entry) => {
    const classification = classifyInfrastructureRelevance(entry.article);
    const predictedRelevant = classification.infrastructure_relevance_score >= SIGNAL_CARD_RELEVANCE_THRESHOLD;
    return { ...entry, classification, predictedRelevant };
  });
  const truePositive = results.filter((item) => item.expectedRelevant && item.predictedRelevant).length;
  const falsePositive = results.filter((item) => !item.expectedRelevant && item.predictedRelevant).length;
  const falseNegative = results.filter((item) => item.expectedRelevant && !item.predictedRelevant).length;
  const precision = truePositive / (truePositive + falsePositive);
  const recall = truePositive / (truePositive + falseNegative);

  assert.equal(precision, 1, results.map((item) => `${item.id}:${item.classification.infrastructure_relevance_score}`).join(', '));
  assert.equal(recall, 1, results.map((item) => `${item.id}:${item.classification.infrastructure_relevance_score}`).join(', '));
});

test('strict router recognizes Korean physical layers and archives weak Korean topics', () => {
  for (const entry of cases) {
    const route = routeStrictInfrastructureRelevance(entry.article);
    if (entry.expectedRelevant) {
      assert.notEqual(route.visibility, 'archive', `${entry.id} should remain publishable`);
    } else {
      assert.equal(route.visibility, 'archive', `${entry.id} should remain outside public lanes`);
    }
  }
});

test('strict router assigns Korean power and cooling signals to concrete lanes', () => {
  const grid = routeStrictInfrastructureRelevance(cases.find((entry) => entry.id === 'ko-grid-code').article);
  const cooling = routeStrictInfrastructureRelevance(cases.find((entry) => entry.id === 'ko-cooling').article);
  assert.equal(grid.laneKey, 'operator-alerts');
  assert.equal(cooling.laneKey, 'technical-bottlenecks');
});

test('Korean market wording archives only when physical infrastructure evidence is absent', () => {
  const marketOnly = routeStrictInfrastructureRelevance({
    title: 'AI 반도체 관련주 급등',
    snippet: '주가와 개인 투자자 매수세를 정리했다.',
    infrastructure_relevance_score: 0.9,
  });
  const physicalCostSignal = routeStrictInfrastructureRelevance({
    title: '데이터센터 전력망 송전비용 급등',
    snippet: '변전소와 송전선로 건설비 상승이 계통 접속 일정과 전력 공급 비용을 바꾼다.',
    infrastructure_relevance_score: 0.9,
  });

  assert.equal(marketOnly.visibility, 'archive');
  assert.deepEqual(marketOnly.blocked_reasons, ['korean_market_chatter_without_physical_infrastructure_evidence']);
  assert.equal(physicalCostSignal.visibility, 'core');
  assert.equal(physicalCostSignal.laneKey, 'operator-alerts');
});
