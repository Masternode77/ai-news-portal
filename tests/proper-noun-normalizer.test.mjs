import test from 'node:test';
import assert from 'node:assert/strict';
import { malformedProperNouns, normalizeProperNouns } from '../scripts/lib/proper-noun-normalizer.mjs';

test('normalizes public proper nouns without changing meaning', () => {
  const input = 'netapp and red hat openshift matter for proxmox, kvm, hyper-v, nutanix, xcp-ng and servethehome readers.';
  assert.equal(
    normalizeProperNouns(input),
    'NetApp and Red Hat OpenShift matter for Proxmox, KVM, Hyper-V, Nutanix, XCP-ng and ServeTheHome readers.'
  );
});

test('reports malformed public proper nouns', () => {
  const matches = malformedProperNouns('netapp supports red hat openshift.');
  assert.ok(matches.some((match) => match.expected === 'NetApp'));
  assert.ok(matches.some((match) => match.expected === 'Red Hat'));
  assert.ok(matches.some((match) => match.expected === 'OpenShift'));
});
