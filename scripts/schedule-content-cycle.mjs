#!/usr/bin/env node
import { runLegacyContentCommand } from './lib/legacy-content-command-wrapper.mjs';

await runLegacyContentCommand('schedule-content-cycle', 'cycle');
