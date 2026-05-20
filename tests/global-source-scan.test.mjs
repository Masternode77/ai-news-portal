import assert from 'node:assert/strict';
import test from 'node:test';
import { runGlobalSourceScan } from '../scripts/lib/global-source-scan.mjs';

test('global source scan treats generated Compute Current articles as non-source material', async () => {
  const scan = await runGlobalSourceScan({ useLive: false });
  assert.ok(scan.source_items.length > 0);
  assert.equal(scan.source_items.some((item) => item.original?.generation_version === 'autonomous_editorial_desk_v1'), false);
  assert.ok(scan.source_health.length > 0);
});
