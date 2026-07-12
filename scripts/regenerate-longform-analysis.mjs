#!/usr/bin/env node
import { runLegacyContentCommand } from './lib/legacy-content-command-wrapper.mjs';

await runLegacyContentCommand('regenerate:longform-analysis', 'generate');
