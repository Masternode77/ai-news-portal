/**
 * `{{name}}` placeholders in prompt files (contracts.md §6, Phase 3d). Rendering is
 * strict: a placeholder without a value fails instead of reaching the model as
 * braces, and a substituted value is never scanned for placeholders again.
 */
export const TEMPLATE_UNRESOLVED = "TEMPLATE_UNRESOLVED";
const PLACEHOLDER = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;

/** Distinct placeholder names in a template, in order of first appearance. */
export function templatePlaceholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1]!))];
}

export function renderTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (match: string, key: string) => {
    const value = fields[key];
    if (value === undefined) throw new Error(`${TEMPLATE_UNRESOLVED}: no value for ${match}`);
    return value;
  });
}
