#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditStaticPerformance } from './lib/performance-budget.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distArgument = process.argv.find((argument) => argument.startsWith('--dist='));
const dist = path.resolve(ROOT, distArgument?.slice('--dist='.length) || 'dist');
const result = await auditStaticPerformance(dist);

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
