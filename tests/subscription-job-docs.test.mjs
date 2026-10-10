import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const readRepositoryText = (relativePath) => fs.readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('scheduled subscription guidance uses an isolated production-anchored job', async () => {
  const [subscription, artwork, imageSkill] = await Promise.all([
    readRepositoryText('docs/subscription-generation.md'),
    readRepositoryText('docs/mac-column-image-automation.md'),
    readRepositoryText('.codex/skills/compute-current-images/SKILL.md'),
  ]);

  for (const guidance of [subscription, artwork, imageSkill]) {
    assert.match(guidance, /subscription-job\.mjs start --ref <production-ready-full-sha>/);
    assert.match(guidance, /40-character `meta\.githubCommitSha`/);
    assert.match(guidance, /structured subprocess/);
    assert.match(guidance, /parse its JSON/);
    assert.match(guidance, /CC_SUBSCRIPTION_JOB_ID/);
    assert.match(guidance, /CC_SUBSCRIPTION_LOCK_OWNER/);
    assert.match(guidance, /job workspace|returned detached workspace|returned workspace/);
  }

  assert.match(subscription, /Application Validation on pull\s+requests to `main`, pushes to `main`, and manual dispatch/);
  assert.match(subscription, /later `start` creates a different,\s+clean workspace/);
  assert.match(artwork, /failed generation remains\s+there with its exact diagnostic changes/);
});

test('job completion guidance preserves failure evidence and enforces publication proof', async () => {
  const [subscription, artwork, imageSkill] = await Promise.all([
    readRepositoryText('docs/subscription-generation.md'),
    readRepositoryText('docs/mac-column-image-automation.md'),
    readRepositoryText('.codex/skills/compute-current-images/SKILL.md'),
  ]);

  for (const guidance of [subscription, artwork, imageSkill]) {
    assert.match(guidance, /subscription-job\.mjs finish --id <job-id> --status <failed\|no_change\|published>/);
    assert.match(guidance, /`failed`[^.]*preserv/is);
    assert.match(guidance, /`no_change`[^.]*clean/is);
    assert.match(guidance, /`published`[^.]*clean[^.]*`origin\/main`[^.]*Vercel[^.]*`READY`[^.]*exact full/is);
    assert.doesNotMatch(guidance, /node scripts\/subscription-operation-lock\.mjs (?:acquire|release)/);
  }

  assert.match(subscription, /refuses to finish while the recorded runner PID is alive/);
  assert.match(artwork, /never reset, clean, stash or switch/);
  for (const guidance of [subscription, artwork, imageSkill]) {
    assert.match(guidance, /one (?:real )?runner (?:lease|attempt)/);
    assert.match(guidance, /retry the identical (?:`finish`|finish command).*same owner and status/is);
    assert.match(guidance, /later job's lock|newer job's lock/);
  }
});
