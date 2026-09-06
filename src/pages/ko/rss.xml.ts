import rss from '@astrojs/rss';
import records from '../../data/korea-briefs.json';
import { SITE } from '../../config/site';
import { buildKoreaBriefRssItems } from '../../../scripts/lib/korea-briefs.mjs';

export function GET() {
  return rss({
    title: 'Compute Current 한국 AI 인프라 브리프',
    description: '한국 정부 원문을 수동 검토한 전력망·데이터센터·냉각 정책 브리프',
    site: `${SITE.url}/ko/`,
    customData: '<language>ko-KR</language>',
    items: buildKoreaBriefRssItems(records),
  });
}
