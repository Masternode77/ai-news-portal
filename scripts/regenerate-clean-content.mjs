import { runEmergencyCleanup } from './emergency-cleanup-public-content.mjs';

const result = await runEmergencyCleanup();
const regenerated = result.cleaned.filter((article) => article.emergency_cleanup_audit?.classification === 'keep_and_regenerate').length;
const shortSignals = result.cleaned.filter((article) => article.emergency_cleanup_audit?.classification === 'keep_as_short_signal').length;
console.log(`clean regeneration complete: full=${regenerated}; short_signals=${shortSignals}`);
