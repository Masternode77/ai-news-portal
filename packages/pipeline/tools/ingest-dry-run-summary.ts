#!/usr/bin/env node
/**
 * Renders a `pipeline run --json` result as Markdown for the GitHub Actions
 * step summary (rebuild-ci.yml, ingest-live-dry-run job): funnel, per-source table,
 * extraction totals, normalize decisions (3b), score verdicts (3c), generated drafts (3d) and dead letters by taxonomy code.
 *
 *   node packages/pipeline/tools/ingest-dry-run-summary.ts <result.json>
 */
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { errorCode } from "../src/runner.ts";

interface SourceStat {
  source_id: string;
  tier: number;
  status: string;
  listed: number;
  kept: number;
  skipped: Record<string, number>;
  ms: number;
  error: string | null;
  fail_streak: number;
  sample: { title: string; url: string; published_at: string | null }[];
  fetch?: { url: string; bytes: number; redirects: number; ms: number };
}

interface Result {
  runId: string;
  status: string;
  live?: boolean;
  funnel: Record<string, unknown>;
  stages: { stage: string; status: string; counts: Record<string, number>; reason?: string; durationMs: number }[];
  sourceStats?: {
    configured: number;
    ok: number;
    failed: number;
    auto_disabled: number;
    items_new: number;
    duplicates: number;
    pool_capped?: number;
    skipped_items: number;
    extract_ok: number;
    extract_failed: number;
    extract_skipped: number;
    sources: SourceStat[];
  };
  normalizeStats?: {
    pool: number;
    candidates: number;
    rejected: number;
    duplicate_of_published: number;
    duplicate_in_pool: number;
    by_method: Record<string, number>;
    published_compared: number;
    published_in_window: number;
    decisions: { canonical_url: string; source_id: string; reason: string; method: string; duplicate_of: string | null; score: number | null }[];
    ms: number;
  };
  scoreStats?: {
    candidates: number;
    passed: number;
    full: number;
    brief: number;
    below_threshold: number;
    below_relevance?: number;
    selected: number;
    not_selected: number;
    insight_eligible: number;
    shortfall: number;
    decisions: {
      canonical_url: string;
      source_id: string;
      total: number;
      tier: string | null;
      selected: boolean;
      rank: number | null;
      reject_reason: string | null;
      scores: Record<string, number>;
      reasons: Record<string, string>;
    }[];
    ms: number;
  };
  generateStats?: {
    selected: number;
    drafted: number;
    failed: number;
    budget_stopped: number;
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
    grounding: { checked: number; passed: number; numbers: number; ungrounded: number };
    grounding_pass_rate: number | null;
    banned: { checked: number; passed: number; matches: number };
    quote_max_words: number;
    decisions: { canonical_url: string; source_id: string; slug: string | null; ok: boolean; error: string | null; model: string | null; cost_usd: number; input_tokens: number; output_tokens: number; grounding_numbers: number; grounding_ungrounded: string[]; quote_max_words: number; banned_matches: string[]; title_ko: string | null }[];
    ms: number;
  };
  qaStats?: {
    drafts: number;
    passed: number;
    rejected: number;
    held: number;
    verdicts: number;
    hard_failed: number;
    soft_failed: number;
    auto_passed: number;
    rule_errors: number;
    rules: number;
    by_rule: Record<string, { checked: number; passed: number; failed: number; auto_passed: number }>;
    decisions: { draft_id: string; slug: string | null; title_ko: string | null; source_id: string | null; outcome: string; failed_rules: string[]; auto_passed_rules: string[]; failed_evidence: Record<string, Record<string, unknown>> }[];
    ms: number;
  };
  imageStats?: {
    passed: number;
    with_images: number;
    generated: number;
    placeholders: number;
    failed_attempts: number;
    budget_stopped: number;
    image_missing: number;
    cost_usd: number;
    decisions: { slug: string; provider: string; placeholder: boolean; path: string; cost_usd: number; attempts: { provider: string; ok: boolean; code: string | null; error: string | null; ms: number }[] }[];
    ms: number;
  };
  ledger?: { deadLetters: { ref_id: string; error: string }[] };
}

/** Feed titles and error strings are untrusted: neutralise table pipes, newlines and Markdown/HTML syntax. */
export function cell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/[\\|*_`[\]<>#]/g, (ch) => `\\${ch}`);
}

/** An autolink `<url>` survives parentheses in the URL; angle brackets and whitespace cannot appear inside it. */
export function link(url: string): string {
  const safe = url.replace(/[<>\s]/g, "");
  return /^https?:\/\//.test(safe) ? `<${safe}>` : cell(url);
}

function skippedText(skipped: Record<string, number>): string {
  const parts = Object.entries(skipped)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`);
  return parts.join(", ");
}

export function summarize(result: Result): string {
  const lines: string[] = [];
  const stats = result.sourceStats;
  lines.push(`## Ingest dry-run — \`${result.status}\`${result.live ? " (live feeds)" : " (fixtures)"}`);
  lines.push("");
  lines.push(`run \`${result.runId}\` · started ${cell(result.funnel["started_at"])}`);
  lines.push("");
  lines.push("| funnel | value |");
  lines.push("|---|---|");
  for (const [key, value] of Object.entries(result.funnel)) {
    if (key === "run_id" || key === "started_at") continue;
    lines.push(`| ${key} | ${cell(value)} |`);
  }
  if (stats) {
    lines.push("");
    lines.push(
      `sources: configured ${stats.configured} · ok ${stats.ok} · failed ${stats.failed} · auto-disabled ${stats.auto_disabled} · items new ${stats.items_new} · duplicates ${stats.duplicates} · pool capped ${stats.pool_capped ?? 0} · skipped entries ${stats.skipped_items} · extraction ok ${stats.extract_ok} / failed ${stats.extract_failed} / skipped ${stats.extract_skipped}`,
    );
    lines.push("");
    lines.push("| source | tier | status | listed | kept | skipped | KB | redirects | ms | error |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    const sorted = [...stats.sources].sort((a, b) => a.tier - b.tier || a.source_id.localeCompare(b.source_id));
    for (const s of sorted) {
      const kb = s.fetch ? (s.fetch.bytes / 1024).toFixed(0) : "";
      const redirects = s.fetch ? String(s.fetch.redirects) : "";
      lines.push(`| ${cell(s.source_id)} | ${s.tier} | ${s.status} | ${s.listed} | ${s.kept} | ${cell(skippedText(s.skipped))} | ${kb} | ${redirects} | ${s.ms} | ${cell(s.error ?? "")} |`);
    }
    const redirected = sorted.filter((s) => (s.fetch?.redirects ?? 0) > 0);
    if (redirected.length > 0) {
      lines.push("");
      lines.push("Feeds that redirected (update `url` in config/sources.yaml):");
      lines.push("");
      for (const s of redirected) lines.push(`- ${cell(s.source_id)} → ${link(s.fetch!.url)} (${s.fetch!.redirects} hop${s.fetch!.redirects === 1 ? "" : "s"})`);
    }
    const samples = stats.sources.filter((s) => s.sample.length > 0).slice(0, 12);
    if (samples.length > 0) {
      lines.push("");
      lines.push("<details><summary>Sample items (newest per source, first 12 sources)</summary>");
      lines.push("");
      for (const s of samples) {
        for (const item of s.sample.slice(0, 2)) lines.push(`- **${cell(s.source_id)}** ${cell(item.published_at ?? "")} — ${cell(item.title)} ${link(item.url)}`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }
  const normalize = result.normalizeStats;
  const normalizeStage = result.stages.find((stage) => stage.stage === "normalize");
  if (normalize && normalizeStage?.status === "done") {
    lines.push("");
    lines.push(`### Normalize (3b) — pool ${normalize.pool} → candidates ${normalize.candidates} · rejected ${normalize.rejected} (published ${normalize.duplicate_of_published}, in pool ${normalize.duplicate_in_pool}) · publications compared ${normalize.published_compared} (${normalize.published_in_window} in window) · ${normalize.ms} ms`);
    const methods = Object.entries(normalize.by_method).sort((a, b) => b[1] - a[1]);
    if (methods.length > 0) {
      lines.push("");
      lines.push("| method | count |");
      lines.push("|---|---|");
      for (const [method, count] of methods) lines.push(`| ${cell(method)} | ${count} |`);
    }
    if (normalize.decisions.length > 0) {
      lines.push("");
      lines.push(`<details><summary>Rejections (first ${Math.min(normalize.decisions.length, 40)} of ${normalize.rejected})</summary>`);
      lines.push("");
      lines.push("| source | reason | method | score | item | duplicate of |");
      lines.push("|---|---|---|---|---|---|");
      for (const d of normalize.decisions.slice(0, 40)) {
        const duplicateOf = d.duplicate_of ? (/^https?:\/\//.test(d.duplicate_of) ? link(d.duplicate_of) : cell(d.duplicate_of)) : "";
        lines.push(`| ${cell(d.source_id)} | ${cell(d.reason)} | ${cell(d.method)} | ${d.score === null ? "" : d.score} | ${link(d.canonical_url)} | ${duplicateOf} |`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }
  const score = result.scoreStats;
  const scoreStage = result.stages.find((stage) => stage.stage === "score");
  if (score && scoreStage?.status === "done") {
    lines.push("");
    lines.push(`### Score (3c) — candidates ${score.candidates} · passed ${score.passed} (full ${score.full}, brief ${score.brief}) · below threshold ${score.below_threshold}${score.below_relevance !== undefined ? ` (${score.below_relevance} on relevance)` : ""} · selected ${score.selected} (not selected ${score.not_selected}, shortfall ${score.shortfall}) · insight-eligible ${score.insight_eligible} · ${score.ms} ms`);
    if (score.decisions.length > 0) {
      lines.push("");
      lines.push(`<details><summary>Verdicts by total (first ${Math.min(score.decisions.length, 40)} of ${score.candidates})</summary>`);
      lines.push("");
      lines.push("| # | sel | total | tier | R | T | I | V | P | source | item | verdict |");
      lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
      for (const d of score.decisions.slice(0, 40)) {
        const s = d.scores;
        lines.push(`| ${d.rank ?? ""} | ${d.selected ? "✓" : ""} | ${d.total.toFixed(3)} | ${cell(d.tier ?? "")} | ${(s["relevance"] ?? 0).toFixed(2)} | ${(s["timeliness"] ?? 0).toFixed(2)} | ${(s["impact"] ?? 0).toFixed(2)} | ${(s["reader_value"] ?? 0).toFixed(2)} | ${(s["insight_potential"] ?? 0).toFixed(2)} | ${cell(d.source_id)} | ${link(d.canonical_url)} | ${cell(d.reject_reason ?? "selected")} |`);
      }
      lines.push("");
      lines.push("</details>");
      const explained = score.decisions.slice(0, 12);
      lines.push("");
      lines.push(`<details><summary>Reasons per axis (top ${explained.length})</summary>`);
      lines.push("");
      for (const d of explained) {
        lines.push(`- **${cell(d.source_id)}** ${d.total.toFixed(3)} ${cell(d.tier ?? "below")}${d.selected ? " ✓" : ""} ${link(d.canonical_url)}`);
        for (const axis of ["relevance", "timeliness", "impact", "reader_value", "insight_potential"]) lines.push(`  - ${axis} ${(d.scores[axis] ?? 0).toFixed(2)}: ${cell(d.reasons[axis] ?? "")}`);
      }
      lines.push("");
      lines.push("</details>");
    }
  }
  const generate = result.generateStats;
  const generateStage = result.stages.find((stage) => stage.stage === "generate");
  if (generate && generateStage?.status === "done") {
    lines.push("");
    const rate = generate.grounding_pass_rate === null ? "n/a" : `${Math.round(generate.grounding_pass_rate * 100)}%`;
    lines.push(`### Generate (3d news_brief) — selected ${generate.selected} · drafted ${generate.drafted} · failed ${generate.failed} · budget-stopped ${generate.budget_stopped} · grounding ${generate.grounding.passed}/${generate.grounding.checked} (${rate}; ${generate.grounding.ungrounded} ungrounded of ${generate.grounding.numbers} numbers) · longest shared run ${generate.quote_max_words} words · banned-phrase guard ${generate.banned.passed}/${generate.banned.checked} clean (${generate.banned.matches} matches) · USD ${generate.cost_usd.toFixed(4)} (${generate.input_tokens} in / ${generate.output_tokens} out) · ${generate.ms} ms`);
    if (generate.decisions.length > 0) {
      lines.push("");
      lines.push("| ok | source | title | slug | model | USD | numbers | ungrounded | run | banned | error |");
      lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
      for (const d of generate.decisions.slice(0, 40)) {
        lines.push(`| ${d.ok ? "✓" : "✗"} | ${cell(d.source_id)} | ${cell(d.title_ko ?? "")} ${link(d.canonical_url)} | ${cell(d.slug ?? "")} | ${cell(d.model ?? "")} | ${d.cost_usd.toFixed(4)} | ${d.grounding_numbers} | ${cell(d.grounding_ungrounded.join(" "))} | ${d.quote_max_words} | ${cell(d.banned_matches.join(" "))} | ${cell(d.error ?? "")} |`);
      }
    }
  }
  const deadLetters = result.ledger?.deadLetters ?? [];
  if (deadLetters.length > 0) {
    const tally = new Map<string, number>();
    for (const d of deadLetters) tally.set(errorCode(d.error), (tally.get(errorCode(d.error)) ?? 0) + 1);
    lines.push("");
    lines.push(`dead letters: ${deadLetters.length}`);
    lines.push("");
    lines.push("| code | count |");
    lines.push("|---|---|");
    for (const [code, count] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) lines.push(`| ${code} | ${count} |`);
  }
  lines.push("");
  

  const qa = result.qaStats;
  if (qa) {
    lines.push("");
    lines.push(`### QA (3g) — drafts ${qa.drafts} · passed ${qa.passed} · rejected ${qa.rejected} · held ${qa.held} · verdicts ${qa.verdicts} (hard failed ${qa.hard_failed}, soft failed ${qa.soft_failed}, auto-passed ${qa.auto_passed}) · rule errors ${qa.rule_errors} · rules ${qa.rules} · ${qa.ms} ms`);
    lines.push("");
    lines.push("| rule | checked | passed | failed | auto-passed | pass rate |");
    lines.push("|---|---|---|---|---|---|");
    for (const [rule, stat] of Object.entries(qa.by_rule)) {
      const rate = stat.checked > 0 ? `${((stat.passed / stat.checked) * 100).toFixed(0)}%` : "—";
      lines.push(`| ${cell(rule)} | ${stat.checked} | ${stat.passed} | ${stat.failed} | ${stat.auto_passed} | ${rate} |`);
    }
    if (qa.decisions.length > 0) {
      lines.push("");
      lines.push("| draft | source | outcome | failed rules | evidence |");
      lines.push("|---|---|---|---|---|");
      for (const d of qa.decisions) {
        const failed = d.failed_rules.map((rule) => (d.auto_passed_rules.includes(rule) ? `${rule} (auto_pass)` : rule)).join(", ");
        const evidence = Object.entries(d.failed_evidence)
          .map(([rule, ev]) => {
            const { params: _params, qa_version: _version, ...rest } = ev;
            return `${rule}: ${JSON.stringify(rest)}`;
          })
          .join("; ");
        lines.push(`| ${cell(d.slug ?? d.title_ko ?? d.draft_id)} | ${cell(d.source_id ?? "")} | ${cell(d.outcome)} | ${cell(failed)} | ${cell(evidence.length > 400 ? `${evidence.slice(0, 400)}…` : evidence)} |`);
      }
    }
  }

  const image = result.imageStats;
  if (image && (image.passed > 0 || image.with_images > 0)) {
    lines.push("");
    lines.push(`### Image (3f) — passed ${image.passed} · with images ${image.with_images} · generated ${image.generated} · placeholders ${image.placeholders} · failed attempts ${image.failed_attempts} · budget-skipped ${image.budget_stopped} · IMAGE_MISSING ${image.image_missing} · USD ${image.cost_usd.toFixed(4)} · ${image.ms} ms`);
    lines.push("");
    lines.push("| slug | provider | placeholder | path | USD | attempts |");
    lines.push("|---|---|---|---|---|---|");
    for (const d of image.decisions) {
      lines.push(`| ${cell(d.slug)} | ${cell(d.provider)} | ${d.placeholder ? "yes" : "no"} | ${cell(d.path)} | ${d.cost_usd.toFixed(4)} | ${cell(d.attempts.map((a) => `${a.provider}:${a.ok ? "ok" : a.code ?? "failed"}`).join(" → "))} |`);
    }
  } else if (image) {
    lines.push("");
    lines.push(`### Image (3f) — no QA-passed drafts reached the stage (passed ${image.passed}); provider order and placeholders are covered by the unit tests`);
  }

  lines.push("| stage | status | duration ms |");
  lines.push("|---|---|---|");
  for (const stage of result.stages) lines.push(`| ${stage.stage} | ${stage.status}${stage.reason ? ` (${stage.reason})` : ""} | ${stage.durationMs} |`);
  return `${lines.join("\n")}\n`;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write("usage: ingest-dry-run-summary.ts <result.json>\n");
    process.exitCode = 2;
  } else {
    readFile(path, "utf8")
      .then((text) => process.stdout.write(summarize(JSON.parse(text) as Result)))
      .catch((error: unknown) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 2;
      });
  }
}
