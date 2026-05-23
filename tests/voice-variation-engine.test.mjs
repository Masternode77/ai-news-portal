import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAutonomousVoice } from '../scripts/lib/voice-variation-engine.mjs';

test('voice selector avoids overusing the same voice from recent articles', () => {
  const voice = selectAutonomousVoice({ primary_infrastructure_layer: 'power' }, {
    recent: [
      { voice: 'Policy risk analyst' },
      { voice: 'Policy risk analyst' },
      { voice: 'Policy risk analyst' },
    ],
  });
  assert.notEqual(voice, 'Policy risk analyst');
});
