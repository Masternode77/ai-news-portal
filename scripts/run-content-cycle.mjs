#!/usr/bin/env node
import { runLegacyContentCommand } from './lib/legacy-content-command-wrapper.mjs';

await runLegacyContentCommand('run-content-cycle', 'cycle');
