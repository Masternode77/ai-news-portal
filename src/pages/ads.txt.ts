import { adsEnabled, adsensePubId } from '../lib/monetization';

export function GET() {
  const body = adsEnabled
    ? `google.com, ${adsensePubId}, DIRECT, f08c47fec0942fa0\n`
    : [
        '# ads.txt — computecurrent.com',
        '# No ad system is active yet. Once the AdSense account is approved,',
        '# set PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX in the deployment',
        '# environment and rebuild; the authorized seller line is then',
        '# published here automatically.',
        '',
      ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
