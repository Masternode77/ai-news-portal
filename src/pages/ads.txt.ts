import { adsConfigured, adsensePubId } from '../lib/monetization';

export function GET() {
  const body = adsConfigured
    ? `google.com, ${adsensePubId}, DIRECT, f08c47fec0942fa0\n`
    : [
        '# ads.txt — computecurrent.com',
        '# No valid AdSense publisher ID is configured for this deployment.',
        '# Set PUBLIC_ADSENSE_CLIENT to the account-issued ca-pub identifier and rebuild',
        '# to publish the corresponding authorized-seller record.',
        '',
      ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
