import { LATEST_EXPERT_LENS_COUNT } from './constants.mjs';
import { callExpertLensText } from './openrouter.mjs';
import { truncate } from './normalize.mjs';

function inferSignal(article) {
  const text = `${article.title} ${article.summary || ''} ${article.articleText || ''}`.toLowerCase();
  if (/(power|grid|utility|substation|energy|ppa)/.test(text)) {
    return 'Power availability and grid interconnection bottlenecks are likely to determine the real pace of capacity expansion.';
  }
  if (/(cooling|thermal|liquid|cdu|rack)/.test(text)) {
    return 'Cooling architecture and operating standardization look like the key variables that will shape rack-density economics.';
  }
  if (/(nvidia|gpu|hbm|inference|training|semiconductor|chip)/.test(text)) {
    return 'The real differentiator is less the chip itself and more the combination of supply certainty, network design, power, and deployment speed.';
  }
  if (/(funding|bond|financing|acquisition|merger|valuation)/.test(text)) {
    return 'This financing event should be read not just as a capital story, but as a signal about future capacity capture and customer confidence.';
  }
  return 'The real takeaway is clearer when execution speed, supply-chain constraints, and regional delivery risk are evaluated alongside the headline.';
}

function fallbackExpertLens(article) {
  const opening = truncate(
    `This ${article.source} story highlights where execution gaps are opening up across ${article.category || 'AI infrastructure'}, not just where demand is growing.`,
    120
  );
  const closing = inferSignal(article);
  return truncate(`${opening} ${closing}`, 220);
}

export async function generateExpertLens(article) {
  const fallback = fallbackExpertLens(article);
  const content = await callExpertLensText({
    systemPrompt: [
      'You are a top-tier analyst covering AI infrastructure, data centers, power, semiconductors, and cloud investing and operations.',
      'Reply in natural, concise English only.',
      'Avoid hype and translation-like phrasing; write like a real sector expert briefing an operator or investor.',
      'Use no more than 2 sentences and stay within 220 characters when possible.',
      'Do not invent facts or numbers that are not supported by the article context.',
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
