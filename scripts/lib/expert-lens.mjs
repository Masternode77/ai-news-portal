import { LATEST_EXPERT_LENS_COUNT } from './constants.mjs';
import { callExpertLensText } from './openrouter.mjs';
import { truncate } from './normalize.mjs';

function inferSignal(article) {
  const text = `${article.title} ${article.summary || ''} ${article.articleText || ''}`.toLowerCase();
  if (/(power|grid|utility|substation|energy|ppa)/.test(text)) {
    return '전력 확보 속도와 수전 인프라 병목이 실제 증설 속도를 좌우할 가능성이 큽니다.';
  }
  if (/(cooling|thermal|liquid|cdu|rack)/.test(text)) {
    return '냉각 아키텍처와 운영 표준화가 랙 밀도 수익성을 가르는 핵심 변수로 보입니다.';
  }
  if (/(nvidia|gpu|hbm|inference|training|semiconductor|chip)/.test(text)) {
    return '실제 차별화 포인트는 칩 자체보다 조달 안정성, 네트워크, 전력, 배치 속도의 결합에 있습니다.';
  }
  if (/(funding|bond|financing|acquisition|merger|valuation)/.test(text)) {
    return '자금조달 이벤트는 단순 재무 뉴스가 아니라 향후 용량 선점과 고객 신뢰 신호로 해석할 필요가 있습니다.';
  }
  return '표면적인 발표보다 실제 구축 속도, 공급망 제약, 지역별 실행 리스크를 함께 봐야 의미가 선명해집니다.';
}

function fallbackExpertLens(article) {
  const opening = truncate(
    `${article.source}의 이번 이슈는 ${article.category || 'AI 인프라'} 시장에서 수요 자체보다 실행력 격차가 어디서 벌어지는지를 보여줍니다.`,
    90
  );
  const closing = inferSignal(article);
  return truncate(`${opening} ${closing}`, 220);
}

export async function generateExpertLens(article) {
  const fallback = fallbackExpertLens(article);
  const content = await callExpertLensText({
    systemPrompt: [
      '당신은 AI 인프라, 데이터센터, 전력, 반도체, 클라우드 투자와 운영을 모두 이해하는 최고 수준의 한국어 애널리스트다.',
      '자연스러운 한국어로만 답하라.',
      '허세나 번역투를 피하고, 실제 업계 전문가가 투자자/운영자에게 설명하듯 쓰라.',
      '2문장 이하, 220자 이하.',
      '기사에 없는 수치나 사실을 만들지 말라.',
    ].join(' '),
    userPrompt: JSON.stringify({
      title: article.title,
      source: article.source,
      category: article.category,
      region: article.region,
      summary: article.summary,
      articleText: article.articleText,
    }),
    maxTokens: 220,
  }).catch(() => '');

  return truncate(content || fallback, 220);
}

export async function attachExpertLens(articles) {
  const sorted = [...articles].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  const withLens = await Promise.all(
    sorted.map(async (article, index) => ({
      ...article,
      expertLens: index < LATEST_EXPERT_LENS_COUNT ? await generateExpertLens(article) : null,
    }))
  );

  return withLens;
}
