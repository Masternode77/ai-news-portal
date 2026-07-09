import fs from 'node:fs';
import { projectConfigPath } from './project-root.mjs';

const CONFIG_PATH = projectConfigPath(import.meta.url, 'boilerplatePatterns.yml');

function parseSimpleYamlList(raw = '', key = '') {
  const lines = String(raw || '').split(/\r?\n/);
  const values = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === `${key}:`) {
      inList = true;
      continue;
    }
    if (inList && /^[a-zA-Z_][\w-]*:\s*$/.test(trimmed)) break;
    if (!inList) continue;
    const match = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
    if (match?.[1]) values.push(match[1].trim());
  }
  return values;
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseRegex(phrase = '') {
  return new RegExp(escapeRegExp(phrase).replace(/\s+/g, '\\s+'), 'gi');
}

export function loadBoilerplatePatternConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return {
      boilerplate: parseSimpleYamlList(raw, 'boilerplate_patterns'),
      copyright: parseSimpleYamlList(raw, 'copyright_footer_patterns'),
      navOrCta: parseSimpleYamlList(raw, 'nav_or_cta_patterns'),
    };
  } catch {
    return {
      boilerplate: [],
      copyright: [],
      navOrCta: [],
    };
  }
}

export const BOILERPLATE_PATTERN_CONFIG = loadBoilerplatePatternConfig();

function compact(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function matchesFor(text = '', phrases = []) {
  const value = String(text || '');
  const matches = [];
  for (const phrase of phrases) {
    const regex = phraseRegex(phrase);
    for (const match of value.matchAll(regex)) {
      matches.push({ phrase, text: match[0], index: match.index ?? 0 });
    }
  }
  return matches;
}

export function cleanBoilerplateText(text = '') {
  let cleaned = compact(text);
  const tailCut = [
    'Want more Data Center Knowledge stories',
    'Copyright ©',
    'Copyright 2026',
    'This website is owned and operated by',
    'All copyright resides',
    'Registered in England and Wales',
    'Terms of Use',
    'Privacy Policy',
    'Sign up for',
    'Take our Survey',
  ];

  for (const phrase of tailCut) {
    const index = cleaned.toLowerCase().indexOf(phrase.toLowerCase());
    if (index >= 0) cleaned = cleaned.slice(0, index).trim();
  }

  return cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && !matchesFor(segment, BOILERPLATE_PATTERN_CONFIG.boilerplate).length)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectBoilerplate(text = '') {
  const original = compact(text);
  const cleaned_text = cleanBoilerplateText(original);
  const boilerplateMatches = matchesFor(original, BOILERPLATE_PATTERN_CONFIG.boilerplate);
  const copyrightMatches = matchesFor(original, BOILERPLATE_PATTERN_CONFIG.copyright);
  const navMatches = matchesFor(original, BOILERPLATE_PATTERN_CONFIG.navOrCta);
  const matchedChars = boilerplateMatches.reduce((total, match) => total + match.text.length, 0);
  const removedChars = Math.max(0, original.length - cleaned_text.length);
  const boilerplate_ratio = original.length
    ? Number((Math.max(matchedChars, removedChars) / original.length).toFixed(3))
    : 0;

  return {
    ok: boilerplate_ratio <= 0.08 && !copyrightMatches.length,
    cleaned_text,
    boilerplate_ratio,
    boilerplate_matches: [...new Set(boilerplateMatches.map((match) => match.phrase))],
    copyright_footer_detected: copyrightMatches.length > 0,
    copyright_matches: [...new Set(copyrightMatches.map((match) => match.phrase))],
    nav_or_cta_detected: navMatches.length > 0,
    nav_or_cta_matches: [...new Set(navMatches.map((match) => match.phrase))],
  };
}

export function hasBoilerplateLeakage(text = '') {
  const result = detectBoilerplate(text);
  return result.boilerplate_ratio > 0.08 || result.copyright_footer_detected;
}
