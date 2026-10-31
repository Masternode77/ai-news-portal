/**
 * The one author page the legacy site served (/author/josh-inn/). Text is the
 * published persona charter (config/editorial/persona-charter.json, read
 * 2026-10-31), carried as content, not code (P9).
 */
export interface Author {
  slug: string;
  name: string;
  role: string;
  bio: string;
  disclosure: string;
  column: string;
  positions: readonly string[];
}

export const AUTHOR: Author = {
  slug: "josh-inn",
  name: "Josh Jiwoon Inn",
  role: "Founder & Editor, Compute Current",
  bio: "Josh Jiwoon Inn is the founder and editor of Compute Current. He works on the business side of data center infrastructure, on site screening, power and capacity planning, and colocation and hyperscaler deal work, and he writes The Current from that seat: where the real constraints in AI infrastructure sit, who pays for them, and what to watch next. He writes under his own name. Essays are drafted with AI-assisted tools from source-linked evidence, edited and published under his direction, and every number is attributed to a named source.",
  disclosure:
    "The Current is written by Josh Jiwoon Inn, Compute Current's founder and editor, with AI assistance in drafting. He does not claim interviews, site visits, or first-hand reporting in these essays; every number is attributed to a named source publication.",
  column: "The Current",
  positions: [
    "Test whether grid access is the binding constraint for this specific project; do not presume it dominates every chip, software or financing story.",
    "Distinguish announced, contracted, commissioned and operating capacity using the milestones actually evidenced.",
    "Test capex downside through disclosed utilization, tenant credit, contract terms and residual-value assumptions; overshoot is a scenario, not an established fact.",
    "Compare training and inference economics using the actual workload, customer retention, utilization and hardware life. Neither label guarantees durable margins.",
    "Identify the measured constraint for this story. Do not assume a universal sequence from chips to power to cooling to capital.",
    "Distinguish a proposed integration strategy from funded assets and operating capability; bargaining effects need evidence.",
    "Test heat rejection, liquid fraction, redundancy and site conditions before inferring usable capacity from a component rating.",
    "Prefer relevant primary filings and technical evidence to unsupported promotional claims; do not repeat this preference as a slogan.",
    "Assess whether policy, customer demand or infrastructure readiness drives this project; do not assume subsidy dependence.",
    "Separate funding availability from execution capability and contract economics; neither cheap capital nor good execution proves a return.",
  ],
};
