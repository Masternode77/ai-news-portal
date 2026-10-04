// Industry radar: a headline-and-link lane for publishers whose terms allow a
// feed listing but not text reuse (docs/source-rights-review.md). Only what
// the feed ships is kept — the exact headline, the publication date, the
// publisher and the link to the publisher's own page. No description, body,
// image or rewritten title is stored or shown, and article pages are never
// fetched. A source leaves the lane when its registry row loses its
// link_only_basis (for example after a removal request).
import Parser from 'rss-parser';
import { fetchPublicResource } from './public-network-fetcher.mjs';
import { safeHttpUrl, stableArticleId } from './normalize.mjs';
import { hasInternalPublicLanguage } from './internal-language-guard.mjs';
import { forbiddenPublicPhraseMatches } from './copy-quality-guard.mjs';
import { detectTruncationArtifacts } from './truncation-detector.mjs';
import { BANNED_PHRASES } from './banned-phrases.mjs';

export const INDUSTRY_HEADLINES_PATH = 'src/data/industry-headlines.json';
export const HEADLINE_MAX_AGE_HOURS = 7 * 24;
export const HEADLINE_LIMIT = 80;
// Each language lane is selected and capped on its own, so a busy English day
// can never crowd the Korean lane out of the snapshot.
export const HEADLINE_LIMITS_BY_LANGUAGE = { en: 80, ko: 30 };
export const HEADLINE_PER_SOURCE = 6;
export const HEADLINE_MIN_SCORE = 3.5;
const BOILERPLATE = /want more .* stories|copyright ©|all rights reserved|sign up for.+newsletter|sponsored|advertorial|\bpromoted\b/i;

import { linkOnlyHeadlineSourceEligible } from './industry-headlines-view.mjs';

export { LINK_ONLY_BASES, SEGMENT_LABELS, eligibleHeadlineSourceIds, headlinesFor } from './industry-headlines-view.mjs';

// core: a pure-play AI, chip, data center or infrastructure company whose
// news is on-beat by itself. Diversified companies (core false) need an AI,
// compute or data center term in the same headline.
const TRACKED_COMPANIES = [
  ['OpenAI', 'ai_companies', true, ['오픈AI']], ['Anthropic', 'ai_companies', true, ['앤트로픽']], ['xAI', 'ai_companies', true],
  ['Google DeepMind', 'ai_companies', true, ['DeepMind']], ['Mistral AI', 'ai_companies', true, ['Mistral']],
  ['Cohere', 'ai_companies', true], ['Perplexity', 'ai_companies', true], ['DeepSeek', 'ai_companies', true],
  ['Moonshot AI', 'ai_companies', true], ['Hugging Face', 'ai_companies', true], ['Scale AI', 'ai_companies', true],
  ['Safe Superintelligence', 'ai_companies', true], ['Thinking Machines', 'ai_companies', true],
  ['Databricks', 'ai_companies', false], ['Snowflake', 'ai_companies', false], ['Palantir', 'ai_companies', false],
  ['Salesforce', 'ai_companies', false], ['ServiceNow', 'ai_companies', false], ['Baidu', 'ai_companies', false],
  ['ByteDance', 'ai_companies', false], ['Tencent', 'ai_companies', false], ['Alibaba', 'ai_companies', false, ['Alibaba Cloud']],
  ['NVIDIA', 'chips', true, ['Nvidia', '엔비디아']], ['AMD', 'chips', true], ['Intel', 'chips', true, ['인텔']], ['TSMC', 'chips', true],
  ['SK hynix', 'chips', true, ['SK Hynix', 'SK하이닉스']], ['Micron', 'chips', true, ['마이크론']], ['Broadcom', 'chips', true, ['브로드컴']], ['Marvell', 'chips', true],
  ['Qualcomm', 'chips', false, ['퀄컴']], ['Arm', 'chips', false, ['Arm Holdings']], ['Cerebras', 'chips', true], ['Groq', 'chips', true],
  ['SambaNova', 'chips', true], ['Tenstorrent', 'chips', true], ['Etched', 'chips', true], ['Lightmatter', 'chips', true],
  ['Ayar Labs', 'chips', true], ['ASML', 'chips', true], ['Applied Materials', 'chips', true], ['Lam Research', 'chips', true],
  ['KLA', 'chips', true], ['Tokyo Electron', 'chips', true], ['GlobalFoundries', 'chips', true], ['Rapidus', 'chips', true],
  ['SMIC', 'chips', true], ['Cambricon', 'chips', true], ['Huawei', 'chips', false], ['Samsung', 'chips', false, ['Samsung Electronics', '삼성전자']],
  ['Supermicro', 'it_infrastructure', true, ['Super Micro', '슈퍼마이크로']], ['Dell', 'it_infrastructure', true, ['Dell Technologies']],
  ['HPE', 'it_infrastructure', true, ['Hewlett Packard Enterprise']], ['Lenovo', 'it_infrastructure', false],
  ['Cisco', 'it_infrastructure', true, ['시스코']], ['Arista', 'it_infrastructure', true], ['Juniper', 'it_infrastructure', true],
  ['Nokia', 'it_infrastructure', false], ['Ciena', 'it_infrastructure', true], ['Coherent', 'it_infrastructure', true],
  ['Lumentum', 'it_infrastructure', true], ['Credo', 'it_infrastructure', true], ['Astera Labs', 'it_infrastructure', true],
  ['Celestica', 'it_infrastructure', true], ['Foxconn', 'it_infrastructure', true, ['Hon Hai']], ['Quanta', 'it_infrastructure', true],
  ['Wiwynn', 'it_infrastructure', true], ['IBM', 'it_infrastructure', false], ['Red Hat', 'it_infrastructure', false],
  ['Pure Storage', 'it_infrastructure', true], ['NetApp', 'it_infrastructure', true], ['Western Digital', 'it_infrastructure', true],
  ['Seagate', 'it_infrastructure', true], ['Cloudflare', 'it_infrastructure', false], ['Akamai', 'it_infrastructure', false],
  ['AWS', 'cloud', true, ['Amazon Web Services']], ['Microsoft', 'cloud', false, ['Azure', 'Microsoft Azure', '마이크로소프트']],
  ['Google', 'cloud', false, ['Google Cloud', 'Alphabet', '구글']], ['Oracle', 'cloud', true, ['OCI', '오라클']], ['Meta', 'cloud', false, ['메타']],
  ['Amazon', 'cloud', false, ['아마존']], ['Apple', 'cloud', false], ['CoreWeave', 'cloud', true], ['Lambda Labs', 'cloud', true],
  ['Nebius', 'cloud', true], ['Crusoe', 'cloud', true], ['Together AI', 'cloud', true], ['Nscale', 'cloud', true],
  ['Fluidstack', 'cloud', true], ['Vultr', 'cloud', true], ['DigitalOcean', 'cloud', true], ['G42', 'cloud', true],
  ['Equinix', 'data_centers', true, ['에퀴닉스']], ['Digital Realty', 'data_centers', true], ['Iron Mountain', 'data_centers', true],
  ['QTS', 'data_centers', true], ['Vantage Data Centers', 'data_centers', true], ['Aligned Data Centers', 'data_centers', true],
  ['STACK Infrastructure', 'data_centers', true], ['CyrusOne', 'data_centers', true], ['EdgeCore', 'data_centers', true],
  ['Compass Datacenters', 'data_centers', true], ['NTT Data', 'data_centers', true], ['AirTrunk', 'data_centers', true],
  ['NEXTDC', 'data_centers', true], ['Princeton Digital', 'data_centers', true], ['Yondr', 'data_centers', true],
  ['Applied Digital', 'data_centers', true], ['Core Scientific', 'data_centers', true], ['IREN', 'data_centers', true],
  ['Cipher Mining', 'data_centers', true], ['TeraWulf', 'data_centers', true], ['Hut 8', 'data_centers', true],
  ['Galaxy Digital', 'data_centers', true], ['Stargate', 'data_centers', true], ['DigitalBridge', 'data_centers', true],
  ['Blackstone', 'data_centers', false], ['Brookfield', 'data_centers', false], ['KKR', 'data_centers', false],
  ['Vertiv', 'power_cooling', true, ['버티브']], ['Schneider Electric', 'power_cooling', true], ['Eaton', 'power_cooling', true],
  ['GE Vernova', 'power_cooling', true], ['Siemens Energy', 'power_cooling', true], ['Bloom Energy', 'power_cooling', true],
  ['Constellation Energy', 'power_cooling', true, ['Constellation']], ['Vistra', 'power_cooling', true],
  ['Talen Energy', 'power_cooling', true, ['Talen']], ['NRG', 'power_cooling', false], ['Dominion Energy', 'power_cooling', false],
  ['Entergy', 'power_cooling', false], ['Duke Energy', 'power_cooling', false], ['NextEra', 'power_cooling', false],
  ['Oklo', 'power_cooling', true], ['NuScale', 'power_cooling', true], ['Kairos Power', 'power_cooling', true],
  ['X-energy', 'power_cooling', true], ['TerraPower', 'power_cooling', true], ['Fermi America', 'power_cooling', true],
  ['Fervo', 'power_cooling', true], ['Commonwealth Fusion', 'power_cooling', true], ['Helion', 'power_cooling', true],
  // Korean companies, matched in Korean-language headlines.
  ['Naver', 'ai_companies', false, ['네이버']], ['Kakao', 'ai_companies', false, ['카카오']],
  ['FuriosaAI', 'chips', true, ['퓨리오사AI', '퓨리오사']], ['Rebellions', 'chips', true, ['리벨리온']],
  ['KT', 'cloud', false], ['SK Telecom', 'cloud', false, ['SK텔레콤', 'SKT']], ['LG CNS', 'it_infrastructure', false],
  ['Samsung SDS', 'it_infrastructure', false, ['삼성SDS']], ['Doosan Enerbility', 'power_cooling', true, ['두산에너빌리티']],
].map(([name, segment, core, aliases = []]) => ({ name, segment, core, aliases }));

const COMPANY_MATCHERS = TRACKED_COMPANIES.map((company) => ({
  ...company,
  // Case-sensitive so common words (arm, meta, crusoe) never match prose.
  pattern: new RegExp(`(?<![A-Za-z0-9])(?:${[company.name, ...company.aliases]
    .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![A-Za-z0-9])`),
}));

// English patterns use word boundaries; Korean terms match as substrings
// because JavaScript word boundaries are ASCII-only.
const TOPIC_RULES = [
  { key: 'data_centers', weight: 3, patterns: [/\b(?:data ?cent(?:er|re)s?|datacent(?:er|re)s?|colocation|hyperscal\w*|server farms?)\b/i, /데이터\s?센터|하이퍼스케일|컴퓨팅\s?센터/] },
  { key: 'ai', weight: 2, patterns: [/(?:\bAI\b|\bA\.I\.|\b(?:artificial intelligence|LLMs?|large language models?|generative|GenAI|inference|foundation models?|frontier models?|agentic|ChatGPT|Claude|Gemini|Llama|Grok|Copilot)\b)/, /인공지능|생성형|초거대|AI(?=[가-힣\s]|$)/] },
  { key: 'chips', weight: 2, patterns: [/\b(?:GPUs?|TPUs?|NPUs?|ASICs?|accelerators?|HBM\d?|DRAM|NAND|memory chips?|chips?|chipmakers?|semiconductors?|foundr(?:y|ies)|wafers?|fabs?|\d{1,2} ?nm|lithography|EUV|CPUs?|Blackwell|Rubin|Hopper|Instinct|Gaudi|Trainium|Inferentia|Maia)\b/i, /반도체|파운드리|웨이퍼|D램|낸드|HBM|GPU|NPU|AI\s?칩/] },
  { key: 'capacity', weight: 1.5, patterns: [/\b(?:new (?:cloud )?regions?|availability zones?|capacity|megawatts?|gigawatts?|\d+ ?(?:MW|GW))\b/i, /\d+\s?(?:MW|GW|메가와트|기가와트)|증설/] },
  { key: 'it', weight: 1.5, patterns: [/\b(?:cloud|compute|servers?|racks?|networking|ethernet|InfiniBand|switch(?:es|ing)?|optics?|optical|photonics?|transceivers?|subsea cables?|fiber|storage|SSDs?|supercomput\w*|HPC|Kubernetes|edge computing)\b/i, /클라우드|서버|네트워크|스토리지|슈퍼컴|컴퓨팅|광통신|해저케이블/] },
  { key: 'power', weight: 1, patterns: [/\b(?:power|grid|nuclear|SMRs?|reactors?|PPAs?|utilit(?:y|ies)|substations?|transmission|interconnection|turbines?|electricity|cooling|liquid[- ]cool\w*|immersion)\b/i, /전력|전력망|원전|원자력|SMR|송전|변전|냉각|액침/] },
  { key: 'capital', weight: 0.5, patterns: [/(?:\$\d|\b(?:capex|funding|raises?|raised|financing|debt|IPO|acquires?|acquisition|merger|leases?|leased|earnings|revenue|guidance|invest(?:s|ment|ing)?|billion)\b)/i, /투자|인수|합병|실적|매출|상장|조원|억달러/] },
];
const CONSUMER_PATTERNS = [
  /\b(?:iPhone|iPad|AirPods|Galaxy S\d+|Pixel \d+|gaming|games?|gamers?|consoles?|Xbox|PlayStation|Nintendo|headphones|earbuds|TVs?|smartwatch(?:es)?|hands-on|deals?|discount|sale|Prime Day|Black Friday|coupons?|wallpapers?|giveaway|how to|best .{1,40} (?:of|for) 20\d\d)\b/i,
  /게임|스마트폰|갤럭시\s?S|아이폰|할인|이벤트|리뷰|사은품/,
];

function decodeEntities(value = '') {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, '’')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function textValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textValue).join(' ');
  if (typeof value === 'object') return textValue(value._ ?? '');
  return '';
}


function registryHosts(row = {}) {
  const configured = String(row.article_hosts || '').split(/[\s,]+/);
  return [row.domain, ...configured]
    .map((value) => String(value || '').trim().toLowerCase().replace(/^www\./, ''))
    .filter(Boolean);
}

// Feeds eligible for the headline lane: a recorded link-only verdict, a
// review inside the window, a working https feed and no text authorization
// (text-authorized sources already feed the wire itself).
export function headlineFeeds(sources = [], now = new Date()) {
  return sources
    .filter((row) => linkOnlyHeadlineSourceEligible(row, now)
      && safeHttpUrl(row.feed)?.startsWith('https://'))
    .map((row) => ({
      sourceRegistryId: row.id,
      source: row.name,
      url: safeHttpUrl(row.feed),
      hosts: registryHosts(row),
      language: row.language === 'ko' ? 'ko' : 'en',
      priority: String(row.priority || 'P2'),
      basis: row.link_only_basis,
    }));
}

export function headlineSafeForPublicSurface(title = '') {
  if (!title) return false;
  if (hasInternalPublicLanguage(title)) return false;
  if (forbiddenPublicPhraseMatches(title).length) return false;
  if (!detectTruncationArtifacts(title, { allowEllipsis: true }).ok) return false;
  if (/(?:…|\.{3})\s*$/.test(title)) return false;
  if (BOILERPLATE.test(title)) return false;
  const lower = title.toLowerCase();
  return !BANNED_PHRASES.some((phrase) => phrase && lower.includes(String(phrase).toLowerCase()));
}

export function headlineCompanies(title = '') {
  return COMPANY_MATCHERS
    .filter((company) => company.pattern.test(title))
    .map(({ name, segment, core }) => ({ name, segment, core }));
}

export function scoreHeadline(title = '') {
  const companies = headlineCompanies(title);
  const topics = TOPIC_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(title)));
  let score = topics.reduce((total, rule) => total + rule.weight, 0);
  if (companies.length) {
    score += companies.some((company) => company.core) ? 3.5 : 1.5;
    score += Math.min(1, 0.5 * (companies.length - 1));
  }
  const consumer = CONSUMER_PATTERNS.some((pattern) => pattern.test(title));
  if (consumer) score -= 4;
  // A diversified company with no AI, compute or data center term stays out.
  const onBeatTopic = topics.some((rule) => ['data_centers', 'ai', 'chips', 'capacity', 'it'].includes(rule.key));
  if (companies.length && !companies.some((company) => company.core) && !onBeatTopic) score = Math.min(score, HEADLINE_MIN_SCORE - 0.5);
  const segment = companies[0]?.segment
    || (topics.some((rule) => rule.key === 'data_centers') ? 'data_centers'
      : topics.some((rule) => rule.key === 'chips') ? 'chips'
        : topics.some((rule) => rule.key === 'ai') ? 'ai_companies'
          : topics.some((rule) => rule.key === 'power') ? 'power_cooling'
            : 'it_infrastructure');
  return { score: Number(score.toFixed(2)), companies, segment, topics: topics.map((rule) => rule.key), consumer };
}

export function cleanHeadlineTitle(value = '') {
  return decodeEntities(textValue(value)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function headlineFromFeedItem(feed = {}, item = {}, now = new Date()) {
  const title = cleanHeadlineTitle(item.title);
  if (title.length < 12 || title.length > 220) return null;
  const url = safeHttpUrl(textValue(item.link) || textValue(item.guid));
  if (!url || !url.startsWith('https://')) return null;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (!(feed.hosts || []).some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return null;
  const published = Date.parse(textValue(item.isoDate) || textValue(item.pubDate) || '');
  if (!Number.isFinite(published) || published > now.getTime() + 3_600_000) return null;
  if (now.getTime() - published > HEADLINE_MAX_AGE_HOURS * 3_600_000) return null;
  if (!headlineSafeForPublicSurface(title)) return null;
  const scored = scoreHeadline(title);
  if (scored.score < HEADLINE_MIN_SCORE) return null;
  return {
    id: stableArticleId(url, title),
    title,
    url,
    source: feed.source,
    sourceRegistryId: feed.sourceRegistryId,
    publishedAt: new Date(published).toISOString(),
    language: feed.language || 'en',
    segment: scored.segment,
    companies: scored.companies.map(({ name, segment }) => ({ name, segment })),
    score: scored.score,
  };
}

function titleTokens(title = '') {
  return new Set(String(title).toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ').split(/\s+/).filter((token) => token.length > 2));
}

function similar(a, b) {
  const left = titleTokens(a);
  const right = titleTokens(b);
  if (!left.size || !right.size) return false;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size) >= 0.7;
}

// Highest-scoring items first for selection; one copy of a story across
// outlets; a per-publisher cap; newest first in the result.
// `preferUrls` ranks those items ahead of the rest (fresh items over carried-
// over ones) without exempting them from any cap.
export function selectHeadlines(items = [], { limit = HEADLINE_LIMIT, perSource = HEADLINE_PER_SOURCE, preferUrls = null } = {}) {
  const preferred = (item) => (preferUrls instanceof Set && preferUrls.has(item.url) ? 1 : 0);
  const ranked = [...items].sort((a, b) => preferred(b) - preferred(a)
    || b.score - a.score
    || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const selected = [];
  const perSourceCount = new Map();
  const seenUrls = new Set();
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (seenUrls.has(item.url)) continue;
    const count = perSourceCount.get(item.sourceRegistryId) || 0;
    if (count >= perSource) continue;
    if (selected.some((other) => other.language === item.language && similar(other.title, item.title))) continue;
    selected.push(item);
    seenUrls.add(item.url);
    perSourceCount.set(item.sourceRegistryId, count + 1);
  }
  return selected.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export function selectHeadlinesByLanguage(items = [], limits = HEADLINE_LIMITS_BY_LANGUAGE) {
  const byLanguage = new Map();
  for (const item of items) {
    const language = item.language || 'en';
    if (!byLanguage.has(language)) byLanguage.set(language, []);
    byLanguage.get(language).push(item);
  }
  return [...byLanguage.entries()]
    .flatMap(([language, group]) => selectHeadlines(group, { limit: limits[language] ?? HEADLINE_LIMIT }))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

const parser = new Parser({ timeout: 20_000 });

async function fetchHeadlineFeed(feed, networkOptions = {}) {
  const feedUrl = new URL(feed.url);
  const response = await fetchPublicResource(feed.url, {
    allowedHosts: [feedUrl.hostname],
    contentTypes: ['application/atom+xml', 'application/rss+xml', 'application/xml', 'text/xml', 'text/html'],
    headers: {
      accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml',
      'user-agent': 'Mozilla/5.0 (compatible; ComputeCurrentBot/1.0)',
    },
    maxBytes: networkOptions.maxBytes || 3 * 1024 * 1024,
    request: networkOptions.request,
    resolveHost: networkOptions.resolveHost,
    timeoutMs: networkOptions.timeoutMs || 20_000,
  });
  const parsed = await parser.parseString(response.bytes.toString('utf8'));
  return parsed.items || [];
}

// A refresh replaces a language's headlines only when it brings enough of
// them. Otherwise that language keeps its previous items that are still inside
// the age window, merged with whatever the refresh did bring, so one failed
// lane (every Korean feed down, say) never blanks its section.
export const MIN_HEADLINES_PER_LANGUAGE = { en: 8, ko: 3 };

// `sourceIds` is the set of currently eligible headline sources: a carried-over
// headline from a source that lost its link-only verdict (a removal request,
// a block, a lapsed review) is never written back.
export function mergeHeadlineSnapshots(result = {}, previous = null, { now = new Date(), minimums = MIN_HEADLINES_PER_LANGUAGE, sourceIds = null } = {}) {
  const cutoff = now.getTime() - HEADLINE_MAX_AGE_HOURS * 3_600_000;
  const current = (item) => item && typeof item.url === 'string' && typeof item.title === 'string'
    && Number.isFinite(Date.parse(item.publishedAt)) && Date.parse(item.publishedAt) >= cutoff;
  const fresh = (Array.isArray(result.items) ? result.items : []).filter(current);
  const prior = (Array.isArray(previous?.items) ? previous.items : [])
    .filter(current)
    .filter((item) => sourceIds instanceof Set && sourceIds.has(item.sourceRegistryId));
  const languages = [...new Set([...Object.keys(minimums), ...fresh.map((item) => item.language), ...prior.map((item) => item.language)])].filter(Boolean);
  const merged = [];
  const carriedOver = {};
  for (const language of languages) {
    const incoming = fresh.filter((item) => item.language === language);
    if (incoming.length >= (minimums[language] ?? 1)) {
      merged.push(...incoming);
      continue;
    }
    const urls = new Set(incoming.map((item) => item.url));
    const kept = prior.filter((item) => item.language === language && !urls.has(item.url));
    // The combined lane goes through the same selection as a fresh one: the
    // language limit, the per-publisher cap, URL and similarity dedupe.
    const lane = selectHeadlines([...incoming, ...kept], {
      limit: HEADLINE_LIMITS_BY_LANGUAGE[language] ?? HEADLINE_LIMIT,
      preferUrls: urls,
    });
    const carried = lane.filter((item) => !urls.has(item.url)).length;
    if (carried) carriedOver[language] = carried;
    merged.push(...lane);
  }
  merged.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return {
    generatedAt: result.generatedAt || now.toISOString(),
    feeds: result.feeds || { attempted: 0, succeeded: 0, failed: [] },
    ...(Object.keys(carriedOver).length ? { carriedOver } : {}),
    items: merged,
  };
}

export async function refreshIndustryHeadlines({ sources = [], now = new Date(), fetchFeed = fetchHeadlineFeed, networkOptions = {} } = {}) {
  const feeds = headlineFeeds(sources, now);
  const failed = [];
  const collected = [];
  const queue = [...feeds];
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const feed = queue.shift();
      try {
        const items = await fetchFeed(feed, networkOptions);
        for (const item of items) {
          const headline = headlineFromFeedItem(feed, item, now);
          if (headline) collected.push(headline);
        }
      } catch (error) {
        failed.push(feed.sourceRegistryId);
        console.warn(`[headlines] feed failed: ${feed.source} -> ${error.message}`);
      }
    }
  });
  await Promise.all(workers);
  const items = selectHeadlinesByLanguage(collected);
  return {
    generatedAt: now.toISOString(),
    feeds: { attempted: feeds.length, succeeded: feeds.length - failed.length, failed: failed.sort() },
    items,
  };
}
