import { SITE } from '../config/site';

export function GET() {
  return new Response(`User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap-index.xml
`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
